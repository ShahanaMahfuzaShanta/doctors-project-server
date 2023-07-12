const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pjcsd.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'UnAuthorized access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if(err){
      return res.status(403).send({message: 'Forbidden access'})
    }
    req.decoded = decoded;
    next();
  })
}

async function run(){
    try{
        await client.connect();
        const servicesCollection = client.db('doctors-portal').collection('services');
        const bookingsCollection = client.db('doctors-portal').collection('bookings');
        const userCollection = client.db('doctors-portal').collection('users');

        app.get('/service', async(req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services); 
        });

        app.get('/user', verifyJWT, async(req, res) => {
          const users = await userCollection.find().toArray();
          res.send(users);
        })

        app.get('/available', async(req, res) => {
          const date = req.query.date;
           //step1: get all services
          const services = await servicesCollection.find().toArray();

           //step2: get the booking of that day
          const query = {date: date};
          const bookings = await bookingsCollection.find(query).toArray();

        //   //step3: for each service. find bookings for that service
          services.forEach(service => {
            const serviceBookings = bookings.filter(b => b.treatment === service.name);
            const booked = serviceBookings.map(s=> s.slot);
            const available = service.slots.filter(s=>!booked.includes(s));
            service.slots = available;
        
          })

          res.send(services);
        })

        app.get('/booking', verifyJWT, async(req, res) => {
          const patient = req.query.patient;
          const decodedEmail = req.decoded.email;
          if(patient === decodedEmail){
            const query = {patient: patient};
          const bookings = await bookingsCollection.find(query).toArray();
          return res.send(bookings);
          }
          else{
            return res.status(403).send({message: 'Forbidden access'});
          }
  
        })

        app.put('/user/admin/:email', verifyJWT, async(req, res) => {
          const email = req.params.email;
          const requester = req.decoded.email;
          const requesterAccount = await userCollection.findOne({ email: requester });
          if(requesterAccount.role === 'admin'){
            const filter = {email: email};
            const updateDoc = {
              $set: {role:'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
          }
          else{
            res.status(403).send({ message: 'forbidden' });
          }
          
        })

        app.put('/user/:email', async(req, res) => {
          const email = req.params.email;
          const user = req.body;
          const filter = {email: email};
          const options = {upsert: true};
          const updateDoc = {
            $set: user,
          };
          const result = await userCollection.updateOne(filter, updateDoc, options);
          const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
          res.send({result, token});
        })


        //for booking appointment
        app.post('/booking', async(req, res) => {
          const booking = req.body;
          //same date a same time a same treatment er upor ar booking jate na dewa hoy
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
          const exists = await bookingsCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          }
          const result = await bookingsCollection.insertOne(booking);
          return res.send({success: true, result});
        });
    }
    finally{
        
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello From Doctor Uncle!')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})