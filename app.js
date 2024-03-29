const express = require("express");
const { createServer } = require("http");
const mysql = require("mysql");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { autoDetect } = require("@serialport/bindings-cpp");
const io = require("socket.io-client");
const axios = require("axios");
const cors = require("cors");
const osu = require('node-os-utils');
const pattern = /MPGMBG/;
require("dotenv").config();

// Connect to Laravel WebSocket server
const socket = io("http://localhost:6001", {
  path: "/socket.io",
  transports: ["websocket"],
});

// Create a connection to the MySQL database
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const app = express();
const httpServer = createServer(app);
const bodyParser = require("body-parser");
let portStatus = false;
let wsStatus = false;
let serialPorts = [];
const Binding = autoDetect();
let dataPayload;
let loraMessages = ""
let loraStatus = 0
let persentageCpuUsage = 0
const cpu = osu.cpu;
const dataLength = 12
const portRegex = /Silicon_Labs_CP2102_USB_to_UART_Bridge/g;
// const portRegex = /USB-Enhanced-SERIAL CH9102/g;

async function usegeInterval(){
  return await cpu.usage()
}

SerialPort.list().then(function (ports) {
  // Open a serial port for each available port
  console.log(ports);
  const found = ports.find(port => port.pnpId?.match(portRegex) != null)
  console.log(found);

  if (!found) {
    return false
  }
  
  const port = new SerialPort({
    path: found.path,
    baudRate: 115200,
  });

  // port.open((err) => {
  //   let errMessage = null;
  //   if (err) {
  //     return console.log("Error opening port: ", err.message);
  //   }

  //   console.log("Port open");
  // });

  // port listening
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
  parser.on("data", (data) => {
    console.log("got word from arduino: " + data);
    // const val = JSON.parse(data)
    let dataInserted = false;

    let edge = data;

    console.log(edge.split(",").length);

    if (edge && edge.split(",").length == dataLength) {
      let [
        IDperangkat,
        IDUplink,
        RssiUplink,
        IDNeighbor,
        RssiNeighbor,
        latitude,
        longitude,
        altitude,
        suhu,
        kelembapan,
        roll,
        pitch,
        yaw,
        vbatt,
        tail,
      ] = edge.split(",");

      // let [
      //   IDperangkat,
      //   latitude,
      //   longitude,
      //   altitude,
      //   jarakR,
      //   jarakG,
      //   arahR,
      //   arahG,
      //   rssi
      // ] = edge.split(",");

      if (pattern.test(IDperangkat)) {
        // Define the data to be inserted
        const dataQeury = {
          id_perangkat: IDperangkat,
          suhu: isNaN(parseFloat(suhu)) ? null : parseFloat(suhu),
          kelembapan: isNaN(parseInt(kelembapan))
            ? null
            : parseInt(kelembapan),
          lat: isNaN(parseFloat(latitude)) ? null : parseFloat(latitude),
          lng: isNaN(parseFloat(longitude)) ? null : parseFloat(longitude),
          roll: isNaN(parseFloat(roll)) ? null : parseFloat(roll),
          pitch: isNaN(parseFloat(pitch)) ? null : parseFloat(pitch),
          yaw: isNaN(parseFloat(yaw)) ? null : parseFloat(yaw),
          vbatt: isNaN(parseFloat(vbatt)) ? null : parseFloat(vbatt),
          created_at: createCurrentDate(),
          perangkat_iot_no_seri: IDperangkat,
          edge_attribute: JSON.stringify({
            altitude: altitude,
            id_uplink: isNaN(IDUplink) ? null : IDUplink,
            rssi_uplink: isNaN(parseInt(RssiUplink)) ? null : parseInt(RssiUplink),
            id_neighbor: isNaN(IDNeighbor) ? null : IDNeighbor,
            rssi_neighbor: isNaN(parseInt(RssiNeighbor)) ? null : parseInt(RssiNeighbor),
          })
        };

        // Insert the data into the "monitoring_portable" table
        connection.query(
          "INSERT INTO monitoring_portable SET ?",
          dataQeury,
          function (err, result) {
            if (err) throw err;
            console.log("Data inserted successfully.");
            // console.log('Result:', result);
          }
        );
      }
    }
  });
});

// const loraPort = new SerialPort({
//   path: 'COM5',
//   baudRate: 115200
// })

// // Switches the port into "flowing mode"
// loraPort.on('data', function (data) {
//   let decodeData = new TextDecoder().decode(data)

//   if(loraStatus == 0 && decodeData.substring(0, 3) == "*01"){
//     loraStatus = 1
//     loraMessages = ""
//   }

//   if (loraStatus == 1) {
//     loraMessages += decodeData
//     console.log("Read Data...");
//   }

//   if (decodeData.substring(decodeData.length-2) == "*#") {
//     loraStatus = 0
//     let [first, mainData, last] = loraMessages.split("&&")
//     let parseData = JSON.parse(mainData)
//     console.log(parseData.image, parseData);
//     require("fs").writeFile("out.png", parseData.image, 'base64', function(err) {
//       console.log(err);
//     });
//   }
// })

const createCurrentDate = () => {
  let date_ob = new Date();

  // current date
  // adjust 0 before single digit date
  let date = ("0" + date_ob.getDate()).slice(-2);

  // current month
  let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);

  // current year
  let year = date_ob.getFullYear();

  // current hours
  let hours = ("0" + date_ob.getHours()).slice(-2);

  // current minutes
  let minutes = ("0" + date_ob.getMinutes()).slice(-2);

  // current seconds
  let seconds = ("0" + date_ob.getSeconds()).slice(-2);

  // prints date & time in YYYY-MM-DD HH:MM:SS format
  const myDate =
    year +
    "-" +
    month +
    "-" +
    date +
    " " +
    hours +
    ":" +
    minutes +
    ":" +
    seconds;

  return myDate
}

app.use(cors());
app.use(bodyParser.json());

//IMPORT ROUTES
const postsRoute = require("./routes/posts");
const { log } = require("console");

app.use("/posts", postsRoute);

//ROUTES
app.get("/", async (req, res) => {
  res.sendFile("views/index.html", { root: __dirname });
});

app.get("/get", async (req, res) => {
  const ports = await SerialPort.list();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.json({
    ok: true,
    ports: ports.map((val, i) => {
      return {
        path: val.path,
        isOpen: false,
      };
    }),
  });
  res.end();
});

app.get("/cpu-usage", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  res.json({
    ok: true,
    persentage: await usegeInterval()
  });

  res.end();
  
});

app.post("/open", (req, res) => {
  console.log(req.body.port);

  // const portIndex = serialPorts.findIndex((p) => p.path === req.body.port);

  if (portIndex === -1) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(400);
    res.send({
      error: {
        message: "Port Tidak ditemukan",
      },
      // ports: serialPorts,
    });
    return console.log("Error opening port: ", "Port tidak ditemukan");
  }

});

app.post("/close", (req, res) => {
  console.log(req.body);
  res.setHeader("Access-Control-Allow-Origin", "*");

  const portIndex = serialPorts.findIndex((p) => p.path === req.body.port);

  if (portIndex === -1) {
    res.status(400);
    res.send({
      error: {
        message: "Port Tidak ditemukan",
      },
    });
    return console.log("Error opening port: ", "Port tidak ditemukan");
  }

  const port = serialPorts[portIndex];

  if (!port.isOpen) {
    res.status(400);
    res.send({
      error: {
        message: "Port already close",
      },
    });
    return console.log("Error opening port: ", "Port already close");
  }

  port.close((err) => {
    portStatus = false;
    if (err) {
      console.log(err);
      res.status(500);
      res.send({
        error: {
          message: err.message,
        },
      });
      return console.log("Error opening port: ", err.message);
    }

    console.log("Port close");
    console.log(err);
    res.json({ status: "ok" });
    res.end();
  });
});
app.post("/send", (req, res) => {
  console.log(req.body);
  if (portStatus) {
    const uniqueCode = req.body.code;
    const messages = "SETCODE," + uniqueCode + ",*";
    port.write(" " + messages, function (err) {
      if (err) {
        return console.log("Error on write: ", err.message);
      }
      console.log("message written");
    });
  }
});

app.post("/set-led", (req, res) => {
  console.log(req.body);
  if (portStatus) {
    const mode = req.body.mode;
    const messages = "SETLED," + mode + ",*";
    port.write(" " + messages, function (err) {
      if (err) {
        return console.log("Error on write: ", err.message);
      }
      console.log("message written");
    });
  }
});

// Connect to DB
// const client = new Client({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'testdb',
//   password: 'FelixItsMe#1412',
//   port: 5432,
// });

// client.connect();

// Connect to the database
connection.connect(function (err) {
  if (err) throw err;
  console.log("Connected to MySQL database.");
});

//START LISTENING
app.listen(7979, function () {
  console.log("Server started on port 7979");
});
