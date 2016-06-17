/**
 * @ngdoc function
 * @name grademanagerApp.controller:MainCtrl
 * @description
 * # MainCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('GradeCtrl', function ($scope, $q, $mdMedia, $http, $timeout, $stateParams, API, auth, $mdDialog) {
        'use strict';
        var grade = this;

        API.loadProject($stateParams.project);

        grade.project = $stateParams.project;

        grade.statsOrder = 'title';
        grade.hideAdd = $mdMedia('sm');

        grade.students = {
            fields: ['id'],
            data: []
        };

        grade.files = [];

        var debounceTimer;

        function debounceSave() {
            if (debounceTimer) {
                $timeout.cancel(debounceTimer);
            }
            debounceTimer = $timeout(function () {
                $http({
                    method: 'POST',
                    url: API.URL + '/project/' + $stateParams.project + '/csv',
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    data: Papa.unparse(angular.copy(grade.students))
                })
                    .success(loadScores);
                //reload data if auto-assoc has added info
            }, 1000);
        }

        grade.isLoading = true;

        //TODO: refactor into service used also in options
        $http.get(API.URL + '/project/' + $stateParams.project + '/csv')
            .success(function (csv) {
                grade.parseCSV(csv);
                $scope.$watch('grade.students', debounceSave, true);
                loadScores();
            });

        $http.get(API.URL + '/project/' + $stateParams.project + '/stats')
            .success(function (stats) {
                grade.stats = stats;
            });

        function studentIdExists(id) {
            for (var i = 0; i < grade.students.data.length; i++) {
                if (String(grade.students.data[i].id) === String(id)) {
                    return true;
                }
            }
            return false;
        }

        function loadScores() {
            $http.get(API.URL + '/project/' + $stateParams.project + '/scores')
                .success(function (data) {
                    //pivot data
                    grade.scores = {};
                    grade.unmatched = {};
                    grade.questions = {};
                    grade.whys = {};
                    grade.maxPoints = 0;
                    data.forEach(function (row) {
                        var key = row.student + ':' + row.copy;
                        var id = key;
                        var target = 'unmatched';
                        if (row.id && studentIdExists(row.id)) {
                            id = row.id;
                            target = 'scores';
                        }

                        if (!grade[target].hasOwnProperty(id)) {
                            grade[target][id] = {
                                id: row.id,
                                key: key,
                                student: row.student,
                                copy: row.copy,
                                questions: {},
                                total: 0
                            };
                        }
                        if (!grade.questions.hasOwnProperty(row.title)) {
                            grade.questions[row.title] = {
                                max: row.max,
                                question: row.question,
                                page: row.page
                            };
                            grade.maxPoints += row.max;
                        }
                        grade[target][id].total += row.score;
                        grade[target][id].questions[row.title] = row.score;

                        grade.whys[key + ':' + row.question] = row.why;

                    });

                    if (!API.options.options.points_max) {
                        API.options.options.points_max = grade.maxPoints;
                    }

                    if (!API.options.options.final_grade_formula) {
                        API.options.options.final_grade_formula = 'row.Grade';
                    }

                    grade.test = {
                        getter: function (id) {
                            if (grade.scores.hasOwnProperty(id)) {
                                return grade.scores[id].total;
                            }
                            return undefined;
                        },
                        minGrade: API.options.options.note_min,
                        maxGrade: API.options.options.note_max,
                        roundingFormula: 'round',
                        roundingUnit: API.options.options.note_grain
                    };
                    grade.isLoading = false;
                })
                .error(function () {
                    grade.isLoading = false;
                });
        }



        this.getStudentById = function (id) {
            for (var i = 0; i < grade.students.data.length; i++) {
                if (grade.students.data[i].id === id) {
                    return grade.students.data[i];
                }
            }
            return undefined;
        };

        // parse CSV data and integrate into into the in memory table
        // source server CSV local paste data or csv.
        // match by id key
        grade.parseCSV = function (csv) {
            //TODO: refactor into service used also in options
            var result = Papa.parse(csv, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true
            });
            //merge keys
            result.meta.fields.forEach(function (field) {
                if (grade.students.fields.indexOf(field) < 0) {
                    grade.students.fields.push(field);
                }
            });
            result.data.forEach(function (row) {
                var existingRow;
                if (!row.hasOwnProperty('id')) {
                    //new unique id
                    row.id = grade.students.data.reduce(function (max, s) {
                        return isNaN(s.id) ? max : s.id > max ? s.id : max;
                    }, 0) + 1;
                }
                //TODO merge data with same id? #44
                existingRow = self.getStudentById(row.id);
                if (existingRow) {
                    angular.extend(existingRow, row);
                } else {
                    grade.students.data.push(row);
                }
            });
        };

        grade.parsePasteData = function () {
            grade.parseCSV(grade.pasteData);
            grade.pasteData = '';
        };

        grade.parseAsNewFile = function () {
            addNewFile(grade.pasteData);
        };

        grade.export = function () {
            grade.pasteData = Papa.unparse(angular.copy(grade.students));
        };

        grade.removeStudent = function (student) {
            grade.students.data.splice(grade.students.data.indexOf(student), 1);
        };

        grade.removeCol = function (col) {
            if (col !== 'id') {
                grade.students.fields.splice(grade.students.fields.indexOf(col), 1);
            }

        };

        grade.annotateScore = function (score) {
            $http.post(API.URL + '/project/' + $stateParams.project + '/annotate', {
                ids: [score.copy ? score.student + ':' + score.copy : score.student]
            });
        };

        grade.annotateAll = function () {
            $http.post(API.URL + '/project/' + $stateParams.project + '/annotate');
        };

        grade.showAssociationDialog = function ($event, row) {
            $mdDialog.show({
                clickOutsideToClose: true,
                templateUrl: 'views/association.html',
                targetEvent: $event,
                controller: 'AssociationCtrl',
                controllerAs: 'ctrl',
                locals: {
                    row: row,
                    scores: grade.scores,
                    unmatched: grade.unmatched,
                    students: grade.students
                }
            });
        };

        grade.renameColumn = function ($event, fields, index, data) {
            var name = fields[index];
            $mdDialog.show({
                clickOutsideToClose: false,
                targetEvent: $event,
                templateUrl: 'views/promptdialog.html',
                controller: 'PromptDialogCtrl',
                controllerAs: 'ctrl',
                locals: {
                    options: {
                        title: 'Rename column ',
                        content: '',
                        label: 'Column name',
                        value: name
                    }
                }
            })
                .then(function (newName) {
                    if (newName && newName !== name) {
                        fields[index] = newName;
                        data.forEach(function (row) {
                            if (row.hasOwnProperty(name)) {
                                row[newName] = row[name];
                                delete row[name];
                            }
                        });
                        grade.save();
                    }
                });
        };

        /* calc test */

        grade.finalGrade = 'row.Grade * 0.5 + row.NoteCC * 0.5';


        grade.valueSaver = function (row, field, value) {
            //check header
            if (grade.students.fields.indexOf(field) < 0) {
                grade.students.fields.push(field);
            }
            if (!isNaN(value) && value !== '' && value !== null) {
                value = parseFloat(value.toFixed(2));
                if (row[field] !== value) {
                    row[field] = value;
                }
            }
            return value;
        };


        grade.calculate = function (row, field, func) {
            return grade.valueSaver(row, field, grade.minMaxRoundGrade(grade.makeFunc(func)(row), 1, 6, 'round', 0.1));
        };

        grade.minMaxRoundGrade = function (g, minGrade, maxGrade, roundingFormula, roundingUnit) {
            return Math.max(minGrade, Math.min(maxGrade,
                Math[roundingFormula](g * (1 / roundingUnit)) * roundingUnit));
        };

        //handle value save?
        grade.grade = function (rawValue, total, minGrade, maxGrade, roundingFormula, roundingUnit) {
            minGrade = parseFloat(minGrade);
            maxGrade = parseFloat(maxGrade);
            roundingUnit = parseFloat(roundingUnit);
            return grade.minMaxRoundGrade(((rawValue / total * (maxGrade - minGrade)) + minGrade), minGrade, maxGrade, roundingFormula, roundingUnit);
        };

        grade.avgTotalStudent = function (field) {
            var a = grade.students.data.reduce(function (a, item) {
                if (item[field] !== '' && !isNaN(item[field])) {
                    a.total += item[field];
                    a.count++;
                }
                return a;

            }, { total: 0, count: 0 });
            return a.total / a.count;
        };

        grade.avg = function (getter) {
            var total = 0;
            var count = 0;
            var key;
            for (key in grade.scores) {
                if (grade.scores.hasOwnProperty(key)) {
                    count++;
                    total = total + getter(grade.scores[key]);
                }

            }
            for (key in grade.unmatched) {
                if (grade.unmatched.hasOwnProperty(key)) {
                    count++;
                    total = total + getter(grade.unmatched[key]);
                }
            }
            return (total / count).toFixed(2);
        };

        grade.avgTotal = function () {
            return grade.avg(function (o) {
                return o.total;
            });
        };

        grade.avgQuestion = function (col) {
            return grade.avg(function (o) {
                return o.questions[col];
            });
        };

        grade.dataTable = function (calculatedField) {
            //max, avg, pass, remed, fail
            var table = [[], [], [], [], []];
            if (grade.students.data.length <= 0) {
                grade.table = table;
                return;
            }
            for (var max = calculatedField.variable - 5; max <= 5 + parseInt(calculatedField.variable); max++) {
                var iteration = {
                    count: 0,
                    total: 0,
                    pass: 0,
                    remed: 0,
                    fail: 0
                };
                for (var i = 0; i < grade.students.data.length; i++) {
                    var value = calculatedField.formula.getter(grade.students.data[i].id);
                    if (!isNaN(value)) {
                        var g = grade.grade(value, max,
                            calculatedField.formula.minGrade,
                            calculatedField.formula.maxGrade,
                            calculatedField.formula.roundingFormula,
                            calculatedField.formula.roundingUnit);
                        //TODO: make configurable? #45
                        if (g >= 4) {
                            iteration.pass++;
                        } else if (g >= 3.5) {
                            iteration.remed++;
                        } else {
                            iteration.fail++;
                        }
                        iteration.total += g;
                        iteration.count++;
                    }
                }
                table[0].push(max);
                table[1].push(iteration.total / iteration.count);
                table[2].push(iteration.pass / iteration.count * 100);
                table[3].push(iteration.remed / iteration.count * 100);
                table[4].push(iteration.fail / iteration.count * 100);
            }
            grade.table = table;
        };

        grade.editCell = function ($event, student, col) {
            if (['Total', 'FinalGrade', 'Grade'].indexOf(col) < 0) {
                var value = student[col];
                $mdDialog.show({
                    clickOutsideToClose: false,
                    targetEvent: $event,
                    templateUrl: 'views/promptdialog.html',
                    controller: 'PromptDialogCtrl',
                    controllerAs: 'ctrl',
                    locals: {
                        options: {
                            title: 'Edit value',
                            content: '',
                            label: 'Value ' + col + ' for ' + student.name,
                            value: value
                        }
                    }
                })
                    .then(function (newVal) {
                        if (newVal && newVal !== value) {
                            student[col] = newVal;
                            grade.save();
                        }
                    });
            }
        };

        /* DND */
        var dropbox;
        var self = this;

        $http.get(API.URL + '/project/' + $stateParams.project + '/gradefiles')
            .success(function (data) {
                self.files = data || [];
            });

        self.save = function () {
            $http.post(API.URL + '/project/' + $stateParams.project + '/gradefiles', grade.files);
        };


        this.makeFunc = function (func) {
            /*jslint evil: true */
            return new Function('row', 'try{ return ' + func + '; } catch (e) { return "error"; }');
        };

        //lookup only student
        //row = external row
        this.lookup = function (row, fileLookup, studentLookup) {
            var lookupValue = this.makeFunc(fileLookup)(row);
            var matches = [];
            if (lookupValue) {
                var studentLookupFunc = this.makeFunc(studentLookup);
                grade.students.data.forEach(function (studentRow) {
                    if (studentLookupFunc(studentRow) === lookupValue) {
                        matches.push(studentRow.id);
                    }
                });
            }
            return matches;
        };

        this.demoStudent = function (file) {
            return self.makeFunc(file.studentLookup)(self.getStudentById(parseInt(file.demoid)));
        };

        this.import = function (file) {
            var studentLookupFunc = this.makeFunc(file.studentLookup);
            var lookupValueFunc = this.makeFunc(file.fileLookup);

            //merge field
            var fields = [];
            for (var key in file.meta.selected) {
                if (file.meta.selected.hasOwnProperty(key)) {
                    var field = file.meta.fields[key];
                    fields.push(field);
                    if (grade.students.fields.indexOf(field) < 0) {
                        grade.students.fields.push(field);
                    }
                }
            }

            file.data.forEach(function (row) {
                var lookupValue = lookupValueFunc(row);
                if (lookupValue) {
                    self.students.data.forEach(function (studentRow) {
                        if (studentLookupFunc(studentRow) === lookupValue) {
                            fields.forEach(function (field) {
                                studentRow[field] = row[field];
                            });
                        }
                    });
                }
            });
            grade.tabIndex = 0;
        };


        this.removeFile = function (file) {
            self.files.splice(self.files.indexOf(file), 1);
            self.save();
        };

        /* import csv by DnD */

        function dragenter(e) {
            e.stopPropagation();
            e.preventDefault();
            dropbox.classList.toggle('dragover', true);
        }

        function dragleave(e) {
            e.stopPropagation();
            e.preventDefault();
            dropbox.classList.toggle('dragover', false);
        }

        function dragover(e) {
            e.stopPropagation();
            e.preventDefault();
        }

        function drop(e) {
            e.stopPropagation();
            e.preventDefault();
            dropbox.classList.toggle('dragover', false);

            var dt = e.dataTransfer;
            var files = dt.files;

            handleFiles(files);
        }

        function handleDataFactory(fileName) {
            return function handleData(results) {
                $scope.$apply(function () {
                    results.name = fileName;
                    results.studentLookup = 'row.name.toLowerCase()';
                    results.fileLookup = '(row["First Name"]  +  " " + row.last_name).toLowerCase()';
                    results.demoid = 1;
                    self.files.push(results);
                    self.save();
                    grade.pasteData = '';
                    grade.tabIndex = grade.files.length + 1;
                });
            };
        }


        function addNewFile(data, name) {
            if (!name) {
                name = 'CSV#' + self.files.length;
            }

            $timeout(function () {
                Papa.parse(data, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    complete: handleDataFactory(name)
                });
            });
        }

        function handleFiles(files) {
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                addNewFile(file, file.name);
            }
        }

        dropbox = document.getElementById('dropbox');
        dropbox.addEventListener('dragenter', dragenter, false);
        dropbox.addEventListener('dragover', dragover, false);
        dropbox.addEventListener('dragleave', dragleave, false);
        dropbox.addEventListener('drop', drop, false);
    });
