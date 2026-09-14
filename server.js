const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { sections: {} };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Get all data
app.get('/api/data', (req, res) => {
  res.json(readData());
});

// Update a section (plants, workLog, sunShade, name)
app.put('/api/sections/:id', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const existing = data.sections[id] || { plants: [], workLog: [], sunShade: '' };
  data.sections[id] = { ...existing, ...req.body };
  writeData(data);
  res.json(data.sections[id]);
});

// Save the display order of tasks in the All Tasks list
app.put('/api/task-order', (req, res) => {
  const data = readData();
  data.taskOrder = Array.isArray(req.body.taskOrder) ? req.body.taskOrder : [];
  writeData(data);
  res.json({ taskOrder: data.taskOrder });
});

app.listen(PORT, () => {
  console.log(`Yard Work Planner running at http://localhost:${PORT}`);
});
