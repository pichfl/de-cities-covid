const cheerio = require('cheerio');
const got = require('got');

let signalThreshold = 35;
let threshold = 50;
let darkredThreshold = 100;

async function loadIncidenceData() {
  let response = await got(
    'https://www.augsburg.de/umwelt-soziales/gesundheit/coronavirus'
  );
  let $ = cheerio.load(response.body, { normalizeWhitespace: true });
  let header = $('h2')
    .filter((_, el) => $(el).text().trim() === 'Entwicklung in Augsburg')
    .parent();

  let text = header.next().find('p:first-child').text().trim();
  let [raw, lastUpdate] = text.split('Stand: ');
  let incidence = Number(
    raw
      .match(/\s\d+,\d\s/)[0]
      .trim()
      .replace(',', '.') || -1
  );
  let definition = raw.match(/(\()(.*)(\))/)[2];

  let img = header.parent().parent().next().find('img');

  // Vaccinations

  let vaccinationsHeader = $('h2')
    .filter((_, el) => $(el).text().trim() === 'Aktuelle Impfzahlen')
    .parent();

  let vaccinationsParagraph = vaccinationsHeader.next().find('p:first-child');
  let vaccinationsText = vaccinationsParagraph.text().trim();
  let total = vaccinationsText
    .match(/([\d.]+)(.*Impfdosen)/)[1]
    .replace('.', '');

  let vaccinationsLastUpdate = vaccinationsText.match(/(\(Stand )(.*)(\))/)[2];

  let details = vaccinationsParagraph.next().text().trim();
  let [
    fullyVaccinated,
    percentFullyVaccinated,
    primaryVaccinated,
    percentPrimaryVaccinated,
  ] = details
    .match(/([\d.]+)/g)
    .map((s) => s.replace('.', ''))
    .filter((s) => s);

  return {
    incidence,
    definition,
    lastUpdate: lastUpdate.split(',')[0],
    overSignalThreshold: incidence > signalThreshold,
    overThreshold: incidence > threshold,
    overDarkredThreshold: incidence > darkredThreshold,
    vaccinations: {
      total,
      fullyVaccinated,
      percentFullyVaccinated,
      primaryVaccinated,
      percentPrimaryVaccinated,
      lastUpdate: vaccinationsLastUpdate,
    },
    img: {
      src: `https://www.augsburg.de${img.attr('src')}`,
      width: img.attr('width'),
      height: img.attr('height'),
    },
  };
}

async function loadCaseNumbers() {
  let response = await got(
    'https://www.augsburg.de/umwelt-soziales/gesundheit/coronavirus/fallzahlen'
  );
  let $ = cheerio.load(response.body, { normalizeWhitespace: true });
  let data = {};

  $('h2')
    .filter((_, el) => $(el).text().trim().startsWith('Fallzahlen'))
    .parent()
    .next()
    .find('p strong')
    .each((_, strong) => {
      let [, label, number] = $(strong)
        .text()
        .trim()
        .match(/(.*:\s)(\d+)(?=\s)/);

      number = Number(number);

      if (label.includes('Fälle')) {
        data.total = number;
      } else if (label.includes('genesen')) {
        data.recovered = number;
      } else if (label.includes('aktuell')) {
        data.current = number;
      } else if (label.includes('verstorben')) {
        data.deceased = number;
      }
    });

  return data;
}

module.exports = async (req, res) => {
  let incidenceData = await loadIncidenceData();
  let caseNumbers = await loadCaseNumbers();

  res.setHeader('Cache-Control', 'max-age=10800, s-maxage=10800, stale-while-revalidate');
  res.setHeader('Content-Type', 'application/json');
  res.send(
    JSON.stringify(
      {
        meta: {
          dataSources: [
            'https://www.augsburg.de/umwelt-soziales/gesundheit/coronavirus',
            'https://www.augsburg.de/umwelt-soziales/gesundheit/coronavirus/fallzahlen',
          ],
          apiAuthor: '@pichfl',
          tresholds: {
            signal: signalThreshold,
            threshold: threshold,
            darkred: darkredThreshold,
          }
        },
        ...incidenceData,
        cases: caseNumbers,
      },
      null,
      '  '
    )
  );
};
