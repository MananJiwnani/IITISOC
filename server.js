  if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
  }
  
  const express = require('express');
  const http = require('http');
  const app = express();
  const server = http.createServer(app);

  const bcrypt = require('bcrypt');
  const passport = require('passport');
  const flash = require('express-flash');
  const session = require('express-session');
  const methodOverride = require('method-override');
  const mongoose = require('mongoose');

  const initializePassport = require('./passport');
  mongoose.connect('mongodb://localhost:27017/userDb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('Connected to MongoDB');
  }).catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });

  const User = require('./user');
  const Property = require('./property');
  
  app.set('view-engine','ejs');
  app.set('views','views');
  app.use(express.static('public'));
  
  app.use(express.urlencoded({ extended: true }));
  app.use(flash());
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' },
  }))
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(methodOverride('_method'));
  
  const checkAuth = (req, res, next) => {
    if (!req.session.user_id) {
        return res.redirect('/login')
    }
    next()
  }

  const checkNotAuth = (req,res,next) => {
    if(req.session.user_id){
        return res.redirect('/')
    }
    next()
  }

  app.get('/', (req, res) => {
    res.render('home.ejs');
  });

  app.get('/vacancies',checkAuth, (req, res) => {
    res.render('vacancies.ejs');
  });
  
  app.get('/owner_portal',checkAuth, checkRole('owner'), (req, res) => {
    res.render('owner_portal.ejs');
  });

  app.get('/tenant_portal',checkAuth, checkRole('tenant'), (req, res) => {
    res.render('tenant_portal.ejs');
  });

  //myprofie is in owner portal
  app.get('/myprofile',checkAuth, checkRole('owner'), (req, res) => {
    res.render('myprofile.ejs');
  });

  app.get('/login', (req, res) => {
    const error = req.flash('error');
    res.render('login.ejs', { error });
  });
  
  app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const foundUser = await User.findAndValidate(email, password);
    if (foundUser) {
        req.session.user_id = foundUser._id;
        res.redirect('/');
    }
    else {
      const userExists = await User.findOne({ email });
      if (userExists) {
        req.flash('error', 'Incorrect password');
        res.redirect('/login');
      } else {
        req.flash('error', 'No user with that email. Please register first.');
        res.redirect('/register');
      }
    }
  }) 
  
  app.get('/register', (req, res) => {
    const error = req.flash('error');
    res.render('register.ejs', { error });
  });
  
  app.post('/register', checkNotAuth, async (req, res) => {
    const { name, email, contact,password, role } = req.body;
    const user = new User({ name, email, contact, password, role })
    await user.save();
    req.session.user_id = user._id;
    res.redirect('/login')
})

  app.post('/logout',checkAuth, (req, res) => {
    req.session.user_id = null;
    res.redirect('/login');
  })
  
  // Adding Properties
  app.get('/addproperties',checkAuth, checkRole('owner'), (req, res)=>{
    res.render('addproperties.ejs');
  });

  app.post('/addproperties',checkAuth, checkRole('owner'), async (req, res) => {
    try {
      const newProperty = new Property({
        owner: req.session.user_id, 
        ownerName: req.body.ownerName,
        propertyType: new RegExp(req.body.propertyType, 'i'),
        subCategory: new RegExp(req.body.subCategory, 'i'),
        area: req.body.area,
        description: req.body.description,
        city: new RegExp(req.body.city, 'i'),
        state: new RegExp(req.body.state, 'i'),
        country: new RegExp(req.body.country, 'i'),
        address: req.body.address,
        price: req.body.price,
        amenities: req.body.amenities,
        images: req.body.images,
        rentedOut: false,
      });
      const savedProperty = await newProperty.save();
      req.session.propertyId = savedProperty._id;
      res.status(200).send('Property listed successfully');
    } catch (error) {
        res.status(403).send(error.message);
      }
  });

  // My properties page for owner to see his properties
  app.get('/myproperties',checkAuth, checkRole('owner'), (req, res) => {
      res.render('myproperties.ejs');
  });

  app.get('/api/myproperties',checkAuth, checkRole('owner'), async (req, res) => {
    try {
      const properties = await Property.find({ owner: req.session.user_id });
      res.status(200).json(properties);
    } catch (error) {
      res.status(404).send(error.message);
    }
  });
  
  app.post('/myproperties/:id',checkAuth, checkRole('owner'), async (req, res) => {
    try {
      const propertyId = req.params.id;
      const updatedProperty = await Property.findByIdAndUpdate(
        propertyId,
        { rentedOut: true },
        { new: true }
      );
      if (!updatedProperty) {
        return res.status(404).send('Property not found');
      }
      res.status(200).send('Property Rented Out Successfully');
    } catch (error) {
      res.status(500).send('Internal server error');
    }
  });
   
  app.post('/',checkAuth, (req, res) =>{
    try{
      const query = {};
      if (req.body.city) query.city = new RegExp(req.body.city, 'i');
      if (req.body.state) query.state = new RegExp(req.body.state, 'i');
      if (req.body.country) query.country = new RegExp(req.body.country, 'i');
      if (req.body.propertyType) query.propertyType = new RegExp(req.body.propertyType, 'i');
      if (req.body.subCategory) query.subCategory = new RegExp(req.body.subCategory, 'i');
      
      if (req.body.min_budget || req.body.max_budget) {
        query.price = {};
        if (req.body.min_budget) query.price.$gte = parseInt(req.body.min_budget);
        if (req.body.max_budget) query.price.$lte = parseInt(req.body.max_budget);
      }

      req.session.query = query;
      return res.redirect('/vacancies');
    } catch {
        return res.redirect('/');
    }
  });

  app.get('/vacancies',checkAuth, (req, res) => {
    const query = req.session.query || {};
    res.render('vacancies.ejs');
  });

  app.get('/api/vacancies',checkAuth, async (req, res) => {
    try {
      const query = req.session.query || {};
      const properties = await Property.find(query);

      res.status(200).json(properties);
    } catch (error) {
      res.status(404).send(error.message);
    }
  });

  app.post('/vacancies',checkAuth, (req, res) => {
    try{
      const query = {};
      if (req.body.city) query.city = new RegExp(req.body.city, 'i');
      if (req.body.state) query.state = new RegExp(req.body.state, 'i');
      if (req.body.country) query.country = new RegExp(req.body.country, 'i');
      if (req.body.propertyType) query.propertyType = new RegExp(req.body.propertyType, 'i');
      if (req.body.subCategory) query.subCategory = new RegExp(req.body.subCategory, 'i');

      if (req.body.min_budget || req.body.max_budget) {
        query.price = {};
        if (req.body.min_budget) query.price.$gte = parseInt(req.body.min_budget);
        if (req.body.max_budget) query.price.$lte = parseInt(req.body.max_budget);
      }
    
      req.session.query = query;
      return res.redirect('/vacancies');
    } catch (error) {
        res.status(404).send(error.message);
    }
  })

  app.post('/api/vacancies/:id',checkAuth, async (req, res) => {
    try {
      const propertyId = req.params.id;
      const userId = req.session.user_id; 
      const property = await Property.findById(propertyId);
  
      if (!property) {
        return res.status(404).send('Property not found');
      }
      res.status(200).send('Application sent successfully');
    } catch (error) {
      res.status(500).send('Internal server error');
    }
  });

  // Authorization
  function checkRole(role) {
    return function(req, res, next) {
        if (req.user.role === role) {
            return next();
        }
        res.status(403).send(`Unauthorized: Only ${role}s can access this page`);
    };
  }

  server.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
  });
