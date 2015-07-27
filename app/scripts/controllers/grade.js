'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:MainCtrl
 * @description
 * # MainCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('GradeCtrl', function ($scope, $http, $stateParams, API, auth, $mdDialog) {

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
        Math[roundingFormula]( ((rawValue / total * (maxGrade - minGrade)) + minGrade) / roundingUnit ) * roundingUnit )).toPrecision(3);
    };

    grade.avg = function(getter){
        var total = 0;
        var count = 0;
        for (var key in grade.scores){
          count++,
          total = total + getter(grade.scores[key]);
        }
        for (key in grade.unmatched){
          count++,
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
