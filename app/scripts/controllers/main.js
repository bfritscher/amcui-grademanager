'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:MainCtrl
 * @description
 * # MainCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('MainCtrl', function ($scope) {
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
    
    this.vLookup2 = function(lookupValue, fileIdx, matchFunc, displayFunc){
      var file = self.files[fileIdx];
      var match = new Function('lookupValue', 'row', 'return  ' + matchFunc + ';');
      var display = new Function('row', 'return  ' + displayFunc + ';');
      for( var i=0; i < file.data.length; i++){
        if(match(lookupValue || '', file.data[i])){
          return display(file.data[i]);
        }        
      }
      return undefined;
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
    		  self.files.push(results)
          save();
        });
    	}
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
