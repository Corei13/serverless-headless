import fs from 'fs';
import path from 'path';
import https from 'https';
import extract from 'extract-zip';

const TARBALL_FILENAME = 'chrome-headless-lambda-linux-x64.zip';
const TARBALL_URL = `https://raw.githubusercontent.com/adieuadieu/serverless-chrome/feature/v1.0/packages/lambda/chrome/${TARBALL_FILENAME}`;
const DOWNLOAD_PATH = path.resolve(__dirname, '../', TARBALL_FILENAME);
const EXTRACT_PATH = path.resolve(__dirname, '../', 'lib/chrome');

const download = (url = TARBALL_URL, destination = DOWNLOAD_PATH) => {
  const file = fs.createWriteStream(destination);

  return new Promise((resolve, reject) => {
    https
      .get(url, response => {
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', error => {
        fs.unlink(destination);
        reject(error);
      });
  });
};

// unzips and makes path.txt point at the correct executable
const extractFile = (file = DOWNLOAD_PATH, destination = EXTRACT_PATH) => {
  return new Promise((resolve, reject) => {
    extract(file, { dir: destination }, error => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
};

if (require.main === module) {
  download()
    .then(extractFile)
    .then(() => fs.unlink(DOWNLOAD_PATH))
    .catch(console.error);
}

export default {
  download,
  extractFile
};
