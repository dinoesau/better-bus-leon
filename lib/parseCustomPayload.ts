export interface ParsedResult {
  pagination: string;
  data: string[][];
  filteredData: (string | number)[][];
  namedFilteredData: {
    id: string;
    latitude: number;
    longitude: number;
    hora: string;
  }[];
}


function base64ToString(base64: string) {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function parseCustomPayload(dataString: string): ParsedResult {
  const decodedString = base64ToString(dataString);

  const rawRows = decodedString.split('|');

  const footerRaw = rawRows.pop()!;
  const paginationData = footerRaw.replace('&', '').trim();

  rawRows[0] = rawRows[0].replace(/^\$\d{4}/, '');

  let parsedRows: (string | number)[][] = rawRows.map(row => row.split('#'));

  // parse row index 3 and 4 to longitude and latitude
  // 3 = latitude, 4 = longitude
  // example input '2109986' should be parsed to 21.09986
  // example input '10173168' should be parsed to -101.73168
  parsedRows = parsedRows.map(row => {
    row[3] = parseFloat(row[3] as string) / 100000;
    row[4] = -(parseFloat(row[4] as string) / 100000);
    return row;
  });

  // Filter specific columns
  const filteredData = parsedRows.map(row => {
    return [
      row[0], row[1], row[3], row[4],
      row[10], row[11],
      row[16], row[17], row[18],
      row[19], row[20], row[21], row[22]
    ];
  });

  // add names to the filtered data instead of column index to only some of the columns
  const namedFilteredData = filteredData.map(row => {
    return {
      id: row[5] as string,
      latitude: row[2] as number,
      longitude: row[3] as number,
      hora: row[11] as string,
    };
  });

  return {
    pagination: paginationData,
    data: parsedRows as string[][],
    filteredData,
    namedFilteredData
  };
}
