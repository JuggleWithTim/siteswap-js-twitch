const express = require('express');
const path = require('path');

const app = express();
const PORT = 3030;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Main frontend route (serve the main HTML)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'twitch.html'));
});

app.listen(PORT, () => {
  console.log(`SiteswapJS server running at http://localhost:${PORT}`);
});