require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS Configuration
app.use(cors({
    origin: function(origin, callback) {
        // Allow all origins in development
        if (!origin && process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // Allowed origins list
        const allowedOrigins = [
            'https://overlord-5uso.onrender.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500'
        ];
        
        if (allowedOrigins.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Optimized Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with cache control
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Robust MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority'
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// Database Models
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: { 
        type: String, 
        required: true,
        minlength: [6, 'Password must be at least 6 characters']
    },
    balance: { type: Number, default: 5, min: 0 },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
}, { versionKey: false });

const BetSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    warframeId: { 
        type: Number, 
        required: true,
        min: 1,
        max: 20
    },
    warframeName: { 
        type: String, 
        required: true,
        trim: true
    },
    amount: { 
        type: Number, 
        required: true,
        min: [5, 'Minimum bet is 5 platinum']
    },
    tickets: { 
        type: Number, 
        required: true,
        min: [1, 'You must buy at least 1 ticket']
    },
    date: { 
        type: Date, 
        default: Date.now,
        index: true
    }
}, { versionKey: false });

const GameSettingsSchema = new mongoose.Schema({
    basePrize: { 
        type: Number, 
        default: 100,
        min: [0, 'Base prize cannot be negative']
    },
    multiplier: { 
        type: Number, 
        default: 5,
        min: [1, 'Multiplier must be at least 1']
    },
    lastDraw: { 
        type: Date 
    },
    minBet: {
        type: Number,
        default: 5
    },
    maxBet: {
        type: Number,
        default: 1000
    }
}, { versionKey: false });

const DrawHistorySchema = new mongoose.Schema({
    winningNumber: { 
        type: Number, 
        required: true,
        min: 1,
        max: 20
    },
    warframeName: { 
        type: String, 
        required: true,
        trim: true
    },
    prizePool: { 
        type: Number, 
        required: true,
        min: 0
    },
    winnerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    winnerName: { 
        type: String,
        trim: true
    },
    winnerAmount: { 
        type: Number,
        min: 0
    },
    date: { 
        type: Date, 
        default: Date.now,
        index: true
    },
    totalBets: {
        type: Number,
        default: 0
    },
    totalParticipants: {
        type: Number,
        default: 0
    }
}, { versionKey: false });

const RegistrationSchema = new mongoose.Schema({
    nickname: { 
        type: String, 
        required: [true, 'Nickname is required'],
        trim: true,
        minlength: [3, 'Nickname must be at least 3 characters'],
        maxlength: [20, 'Nickname must be at most 20 characters']
    },
    mr: { 
        type: Number, 
        min: [0, 'Minimum MR is 0'], 
        max: [40, 'Maximum MR is 40'], 
        required: [true, 'MR is required'] 
    },
    platform: { 
        type: String, 
        required: [true, 'Platform is required'],
        enum: {
            values: ['PC', 'PlayStation', 'Xbox', 'Switch'],
            message: 'Invalid platform'
        }
    },
    discord: { 
        type: String, 
        required: [true, 'Discord is required'],
        match: [/^.{3,32}#[0-9]{4}$/, 'Invalid Discord format']
    },
    protoframe: { 
        type: String, 
        required: [true, 'Protoframe is required'],
        enum: {
            values: ['Excalibur', 'Mag', 'Volt', 'Loki'],
            message: 'Invalid protoframe'
        }
    },
    weapons: { 
        type: [String], 
        required: [true, 'Weapons are required'],
        validate: {
            validator: function(v) {
                return v.length > 0 && v.length <= 3;
            },
            message: 'Select between 1 and 3 weapons'
        }
    },
    event: { 
        type: String, 
        default: 'PvP Tournament - Protoframes vs MK1',
        trim: true
    },
    registrationDate: { 
        type: Date, 
        default: Date.now,
        index: true
    },
    agreedToRules: { 
        type: Boolean, 
        default: true,
        validate: {
            validator: function(v) {
                return v === true;
            },
            message: 'You must accept the rules'
        }
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        index: true
    }
}, { versionKey: false });

const User = mongoose.model('User', UserSchema);
const Bet = mongoose.model('Bet', BetSchema);
const GameSettings = mongoose.model('GameSettings', GameSettingsSchema);
const DrawHistory = mongoose.model('DrawHistory', DrawHistorySchema);
const Registration = mongoose.model('Registration', RegistrationSchema);

// Middlewares
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication token not provided',
                code: 'AUTH_TOKEN_MISSING'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        user.lastLogin = new Date();
        await user.save();
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        
        let errorMessage = 'Invalid token';
        let errorCode = 'INVALID_TOKEN';
        
        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expired';
            errorCode = 'TOKEN_EXPIRED';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Malformed token';
            errorCode = 'MALFORMED_TOKEN';
        }
        
        res.status(401).json({ 
            success: false, 
            error: errorMessage,
            code: errorCode
        });
    }
};

const checkAdmin = (req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ 
            success: false, 
            error: 'Admin access required',
            code: 'ADMIN_ACCESS_REQUIRED'
        });
    }
    next();
};

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Base URL middleware
app.use((req, res, next) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    res.locals.baseUrl = `${protocol}://${host}`;
    next();
});

// Client configuration endpoint
app.get('/api/client-config', (req, res) => {
    res.json({
        success: true,
        data: {
            baseUrl: res.locals.baseUrl,
            environment: process.env.NODE_ENV || 'development'
        }
    });
});

// Authentication Routes
app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Name, email and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(409).json({ 
            success: false, 
            error: 'Email already registered',
            code: 'EMAIL_ALREADY_EXISTS'
        });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const isFirstUser = (await User.countDocuments()) === 0;
    
    const user = new User({
        name,
        email,
        password: hashedPassword,
        isAdmin: isFirstUser
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
        expiresIn: '7d' 
    });

    res.status(201).json({ 
        success: true, 
        data: { 
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt
            },
            baseUrl: res.locals.baseUrl
        }
    });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Email and password are required',
            code: 'MISSING_CREDENTIALS'
        });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid credentials',
            code: 'INVALID_CREDENTIALS'
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid credentials',
            code: 'INVALID_CREDENTIALS'
        });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
        expiresIn: '7d' 
    });

    res.json({
        success: true,
        data: {
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                isAdmin: user.isAdmin,
                lastLogin: user.lastLogin
            },
            baseUrl: res.locals.baseUrl
        }
    });
}));

// User Routes
app.get('/api/user/me', authenticate, asyncHandler(async (req, res) => {
    res.json({ 
        success: true, 
        data: req.user 
    });
}));

app.put('/api/user/me', authenticate, asyncHandler(async (req, res) => {
    const { name } = req.body;
    
    if (!name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Name is required',
            code: 'NAME_REQUIRED'
        });
    }

    req.user.name = name;
    await req.user.save();

    res.json({ 
        success: true, 
        data: req.user 
    });
}));

app.put('/api/user/change-password', authenticate, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            error: 'Current and new password are required',
            code: 'PASSWORDS_REQUIRED'
        });
    }

    const isMatch = await bcrypt.compare(currentPassword, req.user.password);
    if (!isMatch) {
        return res.status(401).json({ 
            success: false, 
            error: 'Current password is incorrect',
            code: 'INCORRECT_PASSWORD'
        });
    }

    req.user.password = await bcrypt.hash(newPassword, 12);
    await req.user.save();

    res.json({ 
        success: true, 
        message: 'Password changed successfully' 
    });
}));

// Betting Routes
app.post('/api/bets', authenticate, asyncHandler(async (req, res) => {
    const { warframeId, warframeName, amount, tickets } = req.body;

    if (!warframeId || !warframeName || amount === undefined || tickets === undefined) {
        return res.status(400).json({ 
            success: false, 
            error: 'Incomplete bet data',
            code: 'INCOMPLETE_BET_DATA'
        });
    }

    const settings = await GameSettings.findOne();
    const minBet = settings?.minBet || 5;
    const maxBet = settings?.maxBet || 1000;

    if (amount < minBet) {
        return res.status(400).json({ 
            success: false, 
            error: `Minimum bet is ${minBet} platinum`,
            code: 'MIN_BET_REQUIRED'
        });
    }

    if (amount > maxBet) {
        return res.status(400).json({ 
            success: false, 
            error: `Maximum bet is ${maxBet} platinum`,
            code: 'MAX_BET_EXCEEDED'
        });
    }

    if (amount > req.user.balance) {
        return res.status(400).json({ 
            success: false, 
            error: 'Insufficient balance',
            code: 'INSUFFICIENT_BALANCE'
        });
    }

    const bet = new Bet({
        userId: req.user._id,
        warframeId,
        warframeName,
        amount,
        tickets
    });

    req.user.balance -= amount;
    
    await mongoose.connection.transaction(async (session) => {
        await bet.save({ session });
        await req.user.save({ session });
    });

    res.status(201).json({ 
        success: true, 
        data: bet,
        newBalance: req.user.balance
    });
}));

app.get('/api/bets', authenticate, asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    
    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { date: -1 }
    };

    const result = await Bet.paginate(
        { userId: req.user._id }, 
        options
    );

    res.json({ 
        success: true, 
        data: result 
    });
}));

app.get("/api/bets/stats", authenticate, asyncHandler(async (req, res) => {
    const stats = await Bet.aggregate([
        { $match: { userId: req.user._id } },
        {
            $group: {
                _id: null, // Agrupa todos os documentos para o usuário atual
                totalAmountBet: { $sum: "$amount" },
                totalTicketsBought: { $sum: "$tickets" },
                // Adicione outras estatísticas que você deseja calcular aqui
            }
        }
    ]);
    res.json({ success: true, data: stats });
}));


// Tournament Routes
app.post('/api/tournament/register', authenticate, asyncHandler(async (req, res) => {
    const { nickname, mr, platform, discord, protoframe, weapons } = req.body;
    
    const requiredFields = ['nickname', 'mr', 'platform', 'discord', 'protoframe', 'weapons'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
        return res.status(400).json({
            success: false,
            error: `Missing required fields: ${missingFields.join(', ')}`,
            code: 'MISSING_FIELDS'
        });
    }

    if (!Array.isArray(weapons) || weapons.length === 0 || weapons.length > 3) {
        return res.status(400).json({
            success: false,
            error: 'Select between 1 and 3 weapons',
            code: 'INVALID_WEAPONS'
        });
    }

    if (mr < 0 || mr > 40) {
        return res.status(400).json({
            success: false,
            error: 'MR must be between 0 and 40',
            code: 'INVALID_MR'
        });
    }

    const existingRegistration = await Registration.findOne({ 
        $or: [
            { nickname },
            { discord },
            { userId: req.user._id }
        ]
    });

    if (existingRegistration) {
        return res.status(409).json({
            success: false,
            error: 'You are already registered for this tournament',
            code: 'ALREADY_REGISTERED'
        });
    }

    const newRegistration = new Registration({
        nickname,
        mr,
        platform,
        discord,
        protoframe,
        weapons,
        userId: req.user._id
    });

    await newRegistration.save();
    
    res.status(201).json({
        success: true,
        message: 'Registration successful!',
        data: newRegistration
    });
}));

app.get('/api/tournament/registrations', asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, platform, minMr, maxMr } = req.query;
    
    const filter = {};
    
    if (platform) {
        filter.platform = platform;
    }
    
    if (minMr || maxMr) {
        filter.mr = {};
        if (minMr) filter.mr.$gte = parseInt(minMr);
        if (maxMr) filter.mr.$lte = parseInt(maxMr);
    }

    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { registrationDate: -1 }
    };

    const result = await Registration.paginate(filter, options);
    
    res.json({ 
        success: true,
        data: result 
    });
}));

app.get('/api/tournament/stats', asyncHandler(async (req, res) => {
    const stats = await Registration.aggregate([
        {
            $group: {
                _id: null,
                totalRegistrations: { $sum: 1 },
                platforms: { 
                    $push: "$platform"
                },
                protoframes: {
                    $push: "$protoframe"
                },
                averageMr: { $avg: "$mr" }
            }
        },
        {
            $project: {
                _id: 0,
                totalRegistrations: 1,
                platforms: {
                    $reduce: {
                        input: "$platforms",
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                "$$value",
                                { [$$this]: { $add: [ { $ifNull: [ "$$value.$$this", 0 ] }, 1 ] } }
                            ]
                        }
                    }
                },
                protoframes: {
                    $reduce: {
                        input: "$protoframes",
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                "$$value",
                                { [$$this]: { $add: [ { $ifNull: [ "$$value.$$this", 0 ] }, 1 ] } }
                            ]
                        }
                    }
                },
                averageMr: { $round: ["$averageMr", 2] }
            }
        }
    ]);

    res.json({
        success: true,
        data: stats[0] || {
            totalRegistrations: 0,
            platforms: {},
            protoframes: {},
            averageMr: 0
        }
    });
}));

// Game Routes
app.post('/api/game/draw', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    let settings = await GameSettings.findOne();
    if (!settings) {
        settings = new GameSettings();
        await settings.save();
    }

    const bets = await Bet.find().populate('userId', 'name email');
    if (bets.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'No bets to draw',
            code: 'NO_BETS_TO_DRAW'
        });
    }

    const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const totalParticipants = new Set(bets.map(bet => bet.userId.toString())).size;
    
    const winningNumber = Math.floor(Math.random() * 20) + 1;
    const winningBets = bets.filter(bet => bet.warframeId === winningNumber);
    
    const prizePool = settings.basePrize + (totalBetAmount * settings.multiplier);

    let winnerData = null;
    let totalWinningAmount = 0;

    if (winningBets.length > 0) {
        totalWinningAmount = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
        
        for (const bet of winningBets) {
            const prize = (bet.amount / totalWinningAmount) * prizePool;
            
            await User.findByIdAndUpdate(
                bet.userId, 
                { $inc: { balance: prize } }
            );
            
            if (!winnerData) {
                winnerData = {
                    userId: bet.userId._id,
                    userName: bet.userId.name,
                    amount: prize
                };
            }
        }
    }

    const warframe = bets.find(b => b.warframeId === winningNumber);
    const drawRecord = new DrawHistory({
        winningNumber,
        warframeName: warframe ? warframe.warframeName : `Warframe ${winningNumber}`,
        prizePool,
        winnerId: winnerData ? winnerData.userId : null,
        winnerName: winnerData ? winnerData.userName : null,
        winnerAmount: winnerData ? winnerData.amount : null,
        totalBets: totalBetAmount,
        totalParticipants
    });

    await mongoose.connection.transaction(async (session) => {
        settings.lastDraw = new Date();
        await settings.save({ session });
        await drawRecord.save({ session });
        await Bet.deleteMany({}, { session });
    });

    res.json({ 
        success: true, 
        data: {
            winningNumber,
            warframeName: warframe ? warframe.warframeName : `Warframe ${winningNumber}`,
            prizePool,
            winnersCount: winningBets.length,
            winners: winningBets.map(bet => ({
                userId: bet.userId._id,
                userName: bet.userId.name,
                amount: bet.amount,
                prize: (bet.amount / totalWinningAmount) * prizePool
            })),
            totalBets: totalBetAmount,
            totalParticipants
        }
    });
}));

app.get('/api/game/history', asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    
    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { date: -1 }
    };

    const result = await DrawHistory.paginate({}, options);
    
    res.json({
        success: true,
        data: result
    });
}));

app.get('/api/game/history/:id', asyncHandler(async (req, res) => {
    const draw = await DrawHistory.findById(req.params.id);
    
    if (!draw) {
        return res.status(404).json({
            success: false,
            error: 'Draw not found',
            code: 'DRAW_NOT_FOUND'
        });
    }

    const winningBets = await Bet.find({
        warframeId: draw.winningNumber,
        date: { $lt: draw.date }
    }).populate('userId', 'name email');

    res.json({
        success: true,
        data: {
            draw,
            winningBets
        }
    });
}));

app.delete('/api/bets/all', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const result = await Bet.deleteMany();
    
    res.json({ 
        success: true, 
        message: `All bets (${result.deletedCount}) have been removed`,
        deletedCount: result.deletedCount
    });
}));

app.put('/api/game/settings', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const { basePrize, multiplier, minBet, maxBet } = req.body;

    let settings = await GameSettings.findOne();
    if (!settings) {
        settings = new GameSettings();
    }

    if (basePrize !== undefined) settings.basePrize = basePrize;
    if (multiplier !== undefined) settings.multiplier = multiplier;
    if (minBet !== undefined) settings.minBet = minBet;
    if (maxBet !== undefined) settings.maxBet = maxBet;

    await settings.save();

    res.json({ 
        success: true, 
        data: settings 
    });
}));

// Admin Routes
app.get('/api/users', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const filter = {};
    
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ];
    }

    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
        select: '-password'
    };

    const result = await User.paginate(filter, options);
    
    res.json({
        success: true,
        data: result
    });
}));

app.get('/api/users/:id', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    const bets = await Bet.find({ userId: user._id })
        .sort({ date: -1 })
        .limit(5);

    res.json({
        success: true,
        data: {
            user,
            recentBets: bets
        }
    });
}));

app.put('/api/users/:id/add-balance', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid amount to add',
            code: 'INVALID_AMOUNT'
        });
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { $inc: { balance: amount } },
        { new: true }
    ).select('-password');

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    res.json({
        success: true,
        message: `Balance added successfully to ${user.email}`,
        data: user,
        transaction: {
            amount,
            reason,
            date: new Date()
        }
    });
}));

app.put('/api/users/:id/make-admin', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: { isAdmin: true } },
        { new: true }
    ).select('-password');

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    res.json({
        success: true,
        message: `${user.email} is now an admin`,
        data: user
    });
}));

app.put('/api/users/:id/remove-admin', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    if (req.user._id.toString() === req.params.id) {
        return res.status(400).json({
            success: false,
            error: 'You cannot remove your own admin privileges',
            code: 'SELF_ADMIN_REMOVAL'
        });
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: { isAdmin: false } },
        { new: true }
    ).select('-password');

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    res.json({
        success: true,
        message: `${user.email} is no longer an admin`,
        data: user
    });
}));

app.get('/api/bets/all', authenticate, checkAdmin, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, userId, warframeId } = req.query;
    
    const filter = {};
    
    if (userId) {
        filter.userId = userId;
    }
    
    if (warframeId) {
        filter.warframeId = parseInt(warframeId);
    }

    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { date: -1 },
        populate: 'userId'
    };

    const result = await Bet.paginate(filter, options);
    
    res.json({
        success: true,
        data: result
    });
}));

// Static Routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handling
app.use((err, req, res, next) => {
    console.error('💥 Error:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Server Startup
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 Access: http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
    console.error('💥 Unhandled rejection:', err);
    server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught exception:', err);
    server.close(() => process.exit(1));
});