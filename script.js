
// Wrap everything in an anonymous function to avoid polluting the global namespace
(function () {
  window.onload = tableau.extensions.initializeAsync().then(() => {
    // Get the worksheet that the Viz Extension is running in
    alert("🌀 Rendering radar chart...");
    const worksheet = tableau.extensions.worksheetContent.worksheet;

    // Save these outside the scope below for handling resizing without refetching the data
    let summaryData = {};
    let encodingMap = {};

    // Use the extensions API to get the summary data and map of encodings to fields,
    // and render the connected radarchart.
    const updateDataAndRender = async () => {
      // Use extensions API to update the table of data and the map from encodings to fields
      [summaryData, encodingMap] = await Promise.all([
        getSummaryDataTable(worksheet),
        getEncodingMap(worksheet)
      ]);

      renderRadarChart(summaryData, encodingMap);
    };

    // Handle re-rendering when the page is resized
    onresize = () => renderRadarChart(summaryData, encodingMap);

    // Listen to event for when the summary data backing the worksheet has changed.
    // This tells us that we should refresh the data and encoding map.
    worksheet.addEventListener(
      tableau.TableauEventType.SummaryDataChanged,
      updateDataAndRender
    );

    // Do the initial update and render
    updateDataAndRender();
  });

// Takes a page of data, which has a list of DataValues (dataTablePage.data)
// and a list of columns and puts the data in a list where each entry is an
// object that maps from field names to DataValues
// (example of a row being: { SUM(Sales): ..., SUM(Profit): ..., Ship Mode: ..., })
function convertToListOfNamedRows (dataTablePage) {
  const rows = [];
  const columns = dataTablePage.columns;
  const data = dataTablePage.data;
  for (let i = data.length - 1; i >= 0; --i) {
    const row = {};
    for (let j = 0; j < columns.length; ++j) {
      row[columns[j].fieldName] = data[i][columns[j].index];
    }
    rows.push(row);
  }
  return rows;
}

// Gets each page of data in the summary data and returns a list of rows of data
// associated with field names.
async function getSummaryDataTable (worksheet) {
  let rows = [];

  // Fetch the summary data using the DataTableReader
  const dataTableReader = await worksheet.getSummaryDataReaderAsync(
    undefined,
    { ignoreSelection: true }
  );
  for (
    let currentPage = 0;
    currentPage < dataTableReader.pageCount;
    currentPage++
  ) {
    const dataTablePage = await dataTableReader.getPageAsync(currentPage);
    rows = rows.concat(convertToListOfNamedRows(dataTablePage));
  }
  await dataTableReader.releaseAsync();

  return rows;
}

// Uses getVisualSpecificationAsync to build a map of encoding identifiers (specified in the .trex file)
// to fields that the user has placed on the encoding's shelf.
// Only encodings that have fields dropped on them will be part of the encodingMap.
async function getEncodingMap(worksheet) {
  const visualSpec = await worksheet.getVisualSpecificationAsync();
  const marks = visualSpec.marksSpecifications[visualSpec.activeMarksSpecificationIndex];
  const encodingMap = {};

  for (const encoding of marks.encodings) {
    const fields = Array.isArray(encoding.field)
      ? encoding.field
      : encoding.field ? [encoding.field] : [];

    if (fields.length > 0) {
      encodingMap[encoding.id] = fields;
    }
  }

  return encodingMap;
}


function drawRadarChart(container, labels, datasets, titleField) {
  const canvas = document.createElement('canvas');
  canvas.id = 'radarChart';
  container.appendChild(canvas);

  const chart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: false, text: `Radar Chart by ${titleField}` },
        tooltip: {
          // add custom tooltippery here
        },
      },

      onClick: (event, elements) => {
        if (elements.length > 0) {
          const datasetIndex = elements[0].datasetIndex;
          const clickedDataset = chart.data.datasets.splice(datasetIndex, 1)[0];
      
          // Reset all dataset styles
          chart.data.datasets.forEach(ds => {
            ds.borderWidth = 2;
          });
          // Enhance the selected one
          clickedDataset.borderWidth = 4;
          // Move selected to the front (beginning of array)
          chart.data.datasets.unshift(clickedDataset);
          chart.update();
        }
      } 
    }
  });
}


function renderRadarChart(data, encodings) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  const categoryField = encodings.category?.[0]?.name;
  const valueFields = encodings.values?.map(f => f.name);

  if (!categoryField || !valueFields || valueFields.length === 0) {
    content.innerHTML = '<p>⚠️ Please assign 1 category and at least 1 measure.</p>';
    return;
  }

  // Detect if Tableau flattened fields into 'Measure Names' / 'Measure Values'
  const hasMeasureNames = data[0]["Measure Names"] && data[0]["Measure Values"];

  let grouped = {};

  if (hasMeasureNames) {
    // Pivoted format — we need to reconstruct fields manually
    data.forEach(row => {
      const category = row[categoryField]._formattedValue || "Unknown";
      const measureName = row["Measure Names"]._formattedValue;
      const measureValue = parseFloat(row["Measure Values"]._value);

      if (!grouped[category]) grouped[category] = {};
      grouped[category][measureName] = measureValue;
    });

    // Extract labels from actual measure names in the data
    const allFields = new Set(data.map(r => r["Measure Names"]._formattedValue));
    const labels = [...allFields];

    const datasets = Object.entries(grouped).map(([label, valuesMap]) => ({
      label,
      data: labels.map(f => valuesMap[f] ?? 0),
      fill: true,
      borderWidth: 2
    }));

    drawRadarChart(content, labels, datasets, categoryField);
  } else {
    // Normal format — multiple value fields as columns
    data.forEach(row => {
      const group = row[categoryField]._formattedValue || "Unknown";

      if (!grouped[group]) grouped[group] = {};

      valueFields.forEach(field => {
        grouped[group][field] = parseFloat(row[field]._value);
      });
    });

    const labels = valueFields;
    const datasets = Object.entries(grouped).map(([label, values]) => ({
      label,
      data: labels.map(f => values[f] ?? 0),
      fill: true,
      borderWidth: 2
    }));

    drawRadarChart(content, labels, datasets, categoryField);
  }
}

})();
