'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:ScanpreviewCtrl
 * @description
 * # ScanpreviewCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ScanPreviewCtrl', function ($http, $stateParams, $sce) {

    var preview = this;
  $http.get('http://192.168.59.103:9001/capture/' + $stateParams.student + '/'
    + $stateParams.page + ':' + $stateParams.copy)
    .success(function(data){
      preview.page = data;
    });
  $http.get('http://192.168.59.103:9001/zones/'+ $stateParams.student + '/'
    + $stateParams.page + ':' + $stateParams.copy )
    .success(function(data){
      preview.zones = data;
    });

    this.pageSrc = function(){
      if(preview.page && preview.page.layout_image){
        return $sce.trustAsResourceUrl('http://192.168.59.103:9001/static/' + preview.page.layout_image);
      }
    }

    //TODO: get from project config db??
    preview.threshold = 0.5;

    preview.ticked = function(zone){
      if(zone.manual >=0){
        return zone.manual === 1;
      }
      if(zone.total <= 0){
        return false;
      }
      return zone.black >= preview.threshold * zone.total;
    };

    preview.toggle = function(zone){
      //TODO: save DB
      if (zone.manual === 0){
        zone.manual = 1;
      } else if(zone.manual === 1){
        zone.manual = 0;
      } else {
        zone.manual = zone.black >= preview.threshold * zone.total ? 0 : 1;
      }
    };

    preview.clear = function(){
      //TODO: save DB
      preview.zones.forEach(function(z){
        z.manual = -1;
      });
    };

  /*
  scoring_variables
    -> darkness_threshold

  */


      /* type_1

  ZONE_FRAME=>1,
  ZONE_NAME=>2,
  ZONE_DIGIT=>3,
  ZONE_BOX=>4,
  */

  /* corner
  (1=TL, 2=TR, 3=BR, 4=BL)
  */

  /* type
  POSITION_BOX=>1,
  POSITION_MEASURE=>2,
  */

  /*
SELECT z.id_a AS question,z.id_b AS answer,
total, black, manual
min(p.x) AS x, min(p.y) AS y,
max(p.x) - min(p.x) AS width,
max(p.y) - min(p.y) AS height,
FROM capture_zone AS z, capture_position as p
ON z.zoneid=p.zoneid
WHERE z.student=1 AND z.page=14 AND z.copy=2
AND z.type=4 AND p.type=1 --ZONE_BOX, POSITION_BOX
GROUP BY z.zoneid, z.id_a, z.id_b
ORDER BY min(p.y), min(p.y)
*/



      /*
      'setAnnotatedPageOutdated'
      setManualPage -> now()
           'setManual'=>{'sql'=>"UPDATE $t_zone"
		   ." SET manual=?"
		   ." WHERE student=? AND page=? AND copy=?"
		   ." AND type=? AND id_a=? AND id_b=?"},

      */


/*

      */
    /*
    manual = -1
    timestamp_manual = -1
    'setAnnotatedPageOutdated'=>{'sql'=>"UPDATE $t_page"
				  ." SET timestamp_annotate=0"
				  ." WHERE student=? AND page=? AND copy=?"},

               'setManualPage'=>{'sql'=>"UPDATE $t_page"
		       ." SET timestamp_manual=?"
		       ." WHERE student=? AND page=? AND copy=?"},
     'setManualPageZones'=>{'sql'=>"UPDATE $t_zone"
			    ." SET manual=?"
			    ." WHERE student=? AND page=? AND copy=?"},

          */

  });
