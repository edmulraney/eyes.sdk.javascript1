'use strict';
const {promisify: p} = require('util');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

module.exports = ({port = 0, showLogs = false} = {}) => {
  const app = express();
  app.use(cookieParser());
  if (showLogs) {
    app.use(morgan('tiny'));
  }
  app.use('/add-cookie', (req, res) => {
    const {name, value} = req.query;
    res.cookie(name, value);
    res.sendStatus(200);
  });
  app.use('/auth', (req, res, next) => {
    if (req.cookies.auth === 'secret') {
      next();
    } else {
      res.status(401).send('need to be authorized');
    }
  });
  app.use('/auth', express.static(path.resolve(__dirname, '../fixtures')));
  app.use('/', express.static(path.resolve(__dirname, '../fixtures')));
  app.get('/err*', (_req, res) => res.sendStatus(500));

  return new Promise((resolve, _reject) => {
    const server = app.listen(port, () => {
      const serverPort = server.address().port;
      const close = p(server.close.bind(server));
      showLogs && console.log(`server running at port: ${serverPort}`);
      resolve({port: serverPort, close});
    });
  });
};
