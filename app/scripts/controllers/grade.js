'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:MainCtrl
 * @description
 * # MainCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('GradeCtrl', function ($scope, $http, $stateParams, API, auth, $mdDialog, $window) {

    var grade = this;

    grade.project = $stateParams.project;

    grade.statsOrder = 'title';

    grade.students = {
      fields: ['id'],
      data: []
    };

    $http.get(API.URL + '/project/' + $stateParams.project + '/csv')
    .success(function(csv){
      grade.parseCSV(csv);
      $scope.$watch('grade.students', function(){
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
      }, true);
    });

    $http.get(API.URL + '/project/' + $stateParams.project + '/stats')
    .success(function(stats){
      grade.stats = stats;
    });

    function loadScores(){
      $http.get(API.URL + '/project/' + $stateParams.project + '/scores')
      .success(function(data){
        //pivot data
        grade.scores = {};
        grade.unmatched = {};
        grade.questions = {};
        grade.whys = {};
        data.forEach(function(row){
          var key = row.student + ':' +  row.copy;
          var id = key;
          var target = 'unmatched';
          if (row.id){
            id = row.id;
            target = 'scores';
          }
          //TODO: if id and not exists in students? add it ot students?
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
          }
          grade[target][id].total += row.score;
          grade[target][id].questions[row.title] = row.score;

          grade.whys[key + ':' + row.question] = row.why;

        });
      });
    }
    loadScores();

    grade.parseCSV = function(csv){
      var result = Papa.parse(csv, {
          header: true,
	        dynamicTyping: true,
          skipEmptyLines: true
      });
      //merge keys
      result.meta.fields.forEach(function(field){
        if (grade.students.fields.indexOf(field) < 0 ){
          grade.students.fields.push(field);
        }
      });
      result.data.forEach(function(row){
        if (!row.hasOwnProperty('id')){
          //new unique id
          row.id = grade.students.data.reduce(function(max, s){
            return isNaN(s.id) ? max : s.id > max ? s.id : max;
          }, 0) + 1;
        }
        //TODO merge data with same id?
        grade.students.data.push(row);
      });
    };

    grade.parsePasteData = function(){
      grade.parseCSV(grade.pasteData);
      grade.pasteData = '';
    };

    grade.removeStudent = function(student){
       grade.students.data.splice(grade.students.data.indexOf(student), 1);
    };

    grade.removeCol = function(col){
        if(col !== 'id'){
            grade.students.fields.splice(grade.students.fields.indexOf(col), 1);
        }

    };

    grade.annotateScore = function(score){
        score.annotateDisabled = true;
        $http.post(API.URL + '/project/' + $stateParams.project + '/annotate', {
          ids: [score.copy ? score.student + ':' + score.copy : score.student]
        })
        .success(function(log){
          console.log(log);
          score.annotateDisabled = false;
          var found = log.logRegroupe.match(/(cr\/.*?\.pdf)/);
          if ( found ){
            $window.open(API.URL + '/project/' + $stateParams.project + '/static/' + found[1] + '?token=' + auth.getToken(), '_blank');
          }
        });
    };

    grade.annotateAllDisabled = false;
    grade.annotateAll = function(){
        grade.annotateAllDisabled = true;
        $http.post(API.URL + '/project/' + $stateParams.project + '/annotate')
        .success(function(log){
          console.log(log);
          $window.open(API.URL + '/project/' + $stateParams.project + '/zip/annotate?token=' + auth.getToken(), '_blank');
          grade.annotateAllDisabled = false;
        });
    };

    grade.showAssociationDialog = function($event, row){
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

    /* calc test */

    $scope.max = 22;

    //handle value save?
    grade.grade = function(rawValue, total, minGrade, maxGrade, roundingFormula, roundingUnit){
      return Math.max(minGrade, Math.min(maxGrade,
        Math[roundingFormula]( ((rawValue / total * (maxGrade - minGrade)) + minGrade) / roundingUnit ) * roundingUnit ));
    };

    grade.avg = function(getter){
        var total = 0;
        var count = 0;
        for (var key in grade.scores){
          count++;
          total = total + getter(grade.scores[key]);
        }
        for (key in grade.unmatched){
          count++;
          total = total + getter(grade.unmatched[key]);
        }
        return (total / count).toFixed(2);
    };

    grade.avgTotal = function(){
      return grade.avg(function(o){
        return o.total;
      });
    };

    grade.avgQuestion = function(col){
      return grade.avg(function(o){
        return o.questions[col];
      });
    };

    grade.test = {
      getter: function(id){
        if(grade.scores.hasOwnProperty(id)){
          return grade.scores[id].total;
        }
      },
      minGrade: 1,
      maxGrade: 6,
      roundingFormula: 'round',
      roundingUnit: 0.1
    };


    grade.dataTable = function(calculatedField){
      //max, avg, pass, remed, fail
      var table = [[],[],[],[],[]];
      if (grade.students.data.length <= 0) {
        return table;
      }
      for (var max = calculatedField.variable - 5; max <= 5 + parseInt(calculatedField.variable); max++){
        var iteration = {
          count: 0,
          total: 0,
          pass: 0,
          remed: 0,
          fail: 0
        };
        for(var i=0; i < grade.students.data.length; i++){
          var value = calculatedField.formula.getter(grade.students.data[i].id);
          if ( !isNaN(value) ) {
            var g = grade.grade(value, max,
                    calculatedField.formula.minGrade,
                    calculatedField.formula.maxGrade,
                    calculatedField.formula.roundingFormula,
                    calculatedField.formula.roundingUnit);
            //TODO: make configurable?
            if (g >= 4){
              iteration.pass++;
            } else if (g >= 3.5){
              iteration.remed++;
            } else {
              iteration.fail++;
            }
            iteration.total += g;
            iteration.count++;
          }
        }
        table[0].push( max );
        table[1].push( iteration.total / iteration.count );
        table[2].push( iteration.pass / iteration.count * 100 );
        table[3].push( iteration.remed / iteration.count * 100 );
        table[4].push( iteration.fail / iteration.count * 100 );
      }
      grade.table = table;
    };

    /* TEST */
    var dropbox;
    var self = this;
    self.files = JSON.parse(localStorage.getItem('files') || '[]');

    self.source = 'name';
    self.idx = 2;
    self.match = "(row['Surname'] + ' ' + row['First name']).toUpperCase() === lookupValue.toUpperCase()";
    self.display = "row['Email address']";

    function save(){
      localStorage.setItem('files', angular.toJson(self.files));
    }

    this.vLookup = function(lookupValue, fileIdx, lookupColumn, dataColumn){
      var file = self.files[fileIdx];
      for( var i=0; i < file.data.length; i++){
        if(file.data[i] && file.data[i][lookupColumn] === lookupValue){
          return file.data[i][dataColumn];
        }
      }
      return undefined;
    };

    this.vLookup2 = function(row, key, lookupValue, fileIdx, matchFunc, displayFunc){
      var file = self.files[fileIdx];
      /*jslint evil: true */
      var match = new Function('lookupValue', 'row', 'return  ' + matchFunc + ';');
      var display = new Function('row', 'return  ' + displayFunc + ';');
      for( var i=0; i < file.data.length; i++){
        if(match(lookupValue || '', file.data[i])){
          var value = display(file.data[i]);
          //save value to cache
          row[key] = value;
          //TODO save when finished
          return value;
        }
      }
      row[key] = undefined;
      return undefined;
    };

    this.calculate = function(file, index){
      if(!file.meta.calculated){
        file.meta.calculated = [];
      }
      file.meta.calculated[index] = {
        type: 'vLookup2',
        source: 'Group',
        targetFile: 0,
        match: 'row.groupe === lookupValue',
        display: 'row.note'
      };
      save();
    };

    this.removeFile = function(file){
      self.files.splice(self.files.indexOf(file),1);
      save();
    };

    function dragenter(e) {
      e.stopPropagation();
      e.preventDefault();
    }

    function dragover(e) {
      e.stopPropagation();
      e.preventDefault();
    }

    function drop(e) {
      e.stopPropagation();
      e.preventDefault();

      var dt = e.dataTransfer;
      var files = dt.files;

      handleFiles(files);
    }

    function handleDataFactory(fileName){
      return function handleData(results) {
        $scope.$apply(function(){
          results.name = fileName;
    		  self.files.push(results);
          save();
        });
    	};
    }

    function handleFiles(files) {
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        Papa.parse(file, {
          worker: true,
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          //step: function(row),
        	complete: handleDataFactory(file.name)
        });
      }
    }

    dropbox = document.getElementById("dropbox");
    dropbox.addEventListener("dragenter", dragenter, false);
    dropbox.addEventListener("dragover", dragover, false);
    dropbox.addEventListener("drop", drop, false);
  });
