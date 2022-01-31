function isLeading(previous: string) {
  return previous === '' || previous === ' ';
}

export function match(
  search: string,
  source: string
): {
  match: boolean;
  score: number;
  wrapped: string;
} {
  const result = {
    match: false,
    score: 0,
    wrapped: '',
  };

  let previous = '';
  let current = '';
  let indexSource = 0;
  let indexSearch = 0;
  let previousMatched = 0;
  while (indexSource < source.length) {
    current = source[indexSource];
    if (
      current === ' ' &&
      indexSearch < search.length &&
      search[indexSearch] !== ' '
    ) {
      indexSearch = 0;
    }
    const isMatch =
      indexSearch < search.length &&
      current.toLowerCase() === search[indexSearch].toLowerCase();
    if (isMatch) {
      if (previousMatched === 0) {
        result.wrapped += '<strong>';
      }
      if (isLeading(previous)) {
        if (previous === '') {
          previousMatched += 2;
        }
        previousMatched += 5;
      }
      previousMatched = 1 + previousMatched;
      indexSearch++;
      if (indexSearch === search.length) {
        result.match = true;
      }
      previousMatched++;
    } else if (previousMatched) {
      result.wrapped += '</strong>';
      result.score = previousMatched;
      previousMatched = 0;
    }
    indexSource++;
    result.wrapped += current;
    previous = current;
  }

  return result;
}
