// https://github.com/spiritway/json.search
// see http://stackoverflow.com/questions/10679580/javascript-search-inside-a-json-object/29308856#29308856
// see http://jsperf.com/regex-on-large-strings
// see http://jsperf.com/json-search

// description
/*
First, stringify the JSON object. Then, you need to store the starts and lengths of the matched substrings. For example:
	"matched".search("ch") // yields 3

For a JSON string, this works exactly the same (unless you are searching explicitly for commas and curly brackets in which case I'd recommend some prior transform of your JSON object before performing regex (i.e. think :, {, }).

Next, you need to reconstruct the JSON object. The algorithm I authored does this by detecting JSON syntax by recursively going backwards from the match index. For instance, the pseudo code might look as follows:

	find the next key preceding the match index, call this theKey
	then find the number of all occurrences of this key preceding theKey, call this theNumber
	using the number of occurrences of all keys with same name as theKey up to position of theKey, traverse the object until keys named theKey has been discovered theNumber times
	return this object called parentChain

With this information, it is possible to use regex to filter a JSON object to return the key, the value, and the parent object chain.

You can see the library and code I authored at http://json.spiritway.co/
*/
export function JSONsearch(object: any, str: string | RegExp) {
  if ((typeof str == 'string' && str.length < 2) || str == '.' || str == '.+') {
    return [{ key: '', val: '', chain: object, inKey: false }];
  }
  function performIndexSearch(ostr: string, str: string | RegExp): number[] {
    let idx;
    if (typeof str == 'string') {
      str = str.toLowerCase();
      idx = ostr.toLowerCase().search(str);
    } else {
      idx = ostr.search(str);
    }
    if (idx == -1) {
      return [];
    }
    let ocpy = ostr;
    const _starts = [idx];
    while (idx != -1) {
      ocpy = ocpy.substr(idx + 1);
      idx = ocpy.search(str);
      if (idx == -1) break;
      _starts.push(_starts[_starts.length - 1] + idx + 1);
    }

    return _starts;
  }

  const oobj = object;
  const keys = Object.keys(object);
  const numKeys = Object.keys(object).length;
  const numDivisions = 4;
  const keysPerDivision = numKeys / numDivisions;
  const strings = [];
  for (let i = 0; i < numDivisions; i++) {
    const obj = {} as any;
    for (let j = i * keysPerDivision; j < numKeys; j++) {
      obj[keys[j]] = object[keys[j]];
    }
    strings.push(JSON.stringify(obj));
  }
  const json = JSON.stringify(object);
  const segmentSize = json.length;
  const numSegments = json.length / segmentSize;
  let starts: number[] = [];
  for (let i = 0; i < numSegments; i++) {
    starts = starts.concat(performIndexSearch(json.substr(i * segmentSize, segmentSize), str));
  }

  const resultKeys: {
    key: any;
    val: any;
    chain: any;
    inKey: boolean;
  }[] = [];
  function backtrack(str: string, start: number, ignore = false): [string, number] {
    let strsub = str.substring(0, start);
    const rquote = str.substring(start).search(/([0-9]|\{|\[|"):?/);
    const quote = strsub
      .split('')
      .reverse()
      .join('')
      .search(/"[^\\]?/);
    if (!ignore && str[start + rquote + 1] === ':') {
      return [
        str.substring(start - quote, start + rquote),
        (
          str
            .substring(0, start + rquote + 1)
            .match(new RegExp('"' + str.substring(start - quote, start + rquote) + '"', 'g')) || ''
        ).length - 1
      ];
    }
    strsub = strsub.split('').reverse().join('');
    const end = strsub.search(/([0-9]|\{|\[|"):"/);
    if (end == -1) {
      return ['-1', 0];
    }
    const strsubsub = strsub.substr(end + 3);
    const newstart = strsubsub.search(/"[^\\]?/);
    let key = strsub.substr(end + 3, newstart);
    key = key.split('').reverse().join('');
    const match = str.substr(0, start - end).match(new RegExp('"' + key + '"', 'g'));
    let num = 0;
    if (match) {
      num = match.length - 1;
    }
    //start - end - newstart, start - end
    return [key, num];
  }

  function keysearch(root: any, key: string, idx: number, matches: [number, boolean] = [0, false]) {
    return (function (results: any, count: number, matches, idx: number) {
      results = {};
      count = 0;
      let val = '';
      for (const i in root) {
        if (i == key && matches[0] == idx) {
          const obj = {} as any;
          obj[key] = root[i];
          return [obj, [1, true], obj[key]];
        }
        if (i == key) {
          matches[0]++;
        }
        if (typeof root[i] != 'object' || root[i] == null) continue;
        count++;
        let result = (function () {
          return keysearch(root[i], key, idx, matches);
        })();
        matches[0] = result[1][0];
        matches[1] = result[1][1];
        const found = matches[1];
        if (found && result.length > 2) {
          val = result[2];
        }
        result = result[0];
        if (found) {
          results[i] = result;
          break;
        }
      }
      if (count == 0) {
        return [[], matches, val];
      } else {
        return [results, matches, val];
      }
    })({}, 0, matches, idx);
  }

  //https://jsfiddle.net/dfpL4ayL/3/
  function smartJSONextend(obj1: any, obj2: any) {
    //clone
    const mergedObj = JSON.parse(JSON.stringify(obj1));

    (function recurse(currMergedObj, currObj2) {
      let key;

      for (key in currObj2) {
        if (currObj2.hasOwnProperty(key)) {
          //keep path alive in mergedObj
          if (!currMergedObj[key]) {
            currMergedObj[key] = undefined;
          }

          if (
            typeof currObj2[key] === 'string' ||
            typeof currObj2[key] === 'number' ||
            typeof currObj2[key] === 'boolean'
          ) {
            //overwrite if obj2 is leaf and not nested
            currMergedObj[key] = currObj2[key];
          } else if (typeof currObj2[key] === 'object') {
            //obj2 is nested

            //and currMergedObj[key] is undefined, sync types
            if (!currMergedObj[key]) {
              //obj2[key] ifArray
              if (
                currObj2.hasOwnProperty(key) &&
                Array.isArray(currObj2[key]) &&
                currObj2[key].hasOwnProperty('length') &&
                currObj2[key].length !== undefined
              ) {
                currMergedObj[key] = [];
              } else {
                currMergedObj[key] = {};
              }
            }
            recurse(currMergedObj[key], currObj2[key]);
          }
        }
      }
    })(mergedObj, obj2);

    return mergedObj;
  }

  for (const i in starts) {
    const [key, num] = backtrack(json, starts[i]);
    const [results, , val] = keysearch(oobj, key, num);
    const inKey = key.search(str) != -1;
    const obj = { key, val, chain: results, inKey: inKey };
    resultKeys.push(obj);
  }

  let merged = {};
  for (const val of resultKeys) {
    merged = smartJSONextend(merged, val.chain);
  }
  return resultKeys;
}
