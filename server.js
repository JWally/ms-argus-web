/* eslint-disable @typescript-eslint/no-var-requires */
const express = require('express')
const path = require('path')
const home = path.join(__dirname, '/public')
const app = express()
app.use(express.static(home))
app.use('/dist', express.static(__dirname + '/dist'))

app.listen(8000, () => console.log('⚡'))
