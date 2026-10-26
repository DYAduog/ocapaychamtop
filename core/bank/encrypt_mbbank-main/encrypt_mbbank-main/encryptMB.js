const wasmEnc = require('./utils/loadWasm');
const fs = require('fs').promises;
const express = require('express');
const app = express();
app.use(express.json());

async function makeEncrypt(requestData) {
  const wasmData = await fs.readFile('./main.wasm');
  const encrypt = await wasmEnc(wasmData, requestData, "0");
  return encrypt
}

app.post('/encrypt', async (req, res) => {
  const requestData = req.body;
  const dataEnc = await makeEncrypt(JSON.parse(JSON.stringify(requestData)));
  res.json({ dataEnc });
});

const port = 3001;
app.listen(port, () => console.log(`Server running on port ${port}`));
