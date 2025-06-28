require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

/**************************************/
/* MODELOS */
/**************************************/

// Modelo de Usuário
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 1000 },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Modelo de Aposta
const BetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    warframeId: { type: Number, required: true },
    warframeName: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

// Modelo de Configurações do Jogo
const GameSettingsSchema = new mongoose.Schema({
    basePrize: { type: Number, default: 100 },
    multiplier: { type: Number, default: 5 },
    lastDraw: { type: Date }
});

// Modelo de Inscrição para Torneio
const RegistrationSchema = new mongoose.Schema({
    nickname: { type: String, required: [true, 'Nickname é obrigatório'] },
    mr: { type: Number, min: 0, max: 40, required: [true, 'MR é obrigatório'] },
    platform: { type: String, required: [true, 'Plataforma é obrigatória'] },
    discord: { type: String, required: [true, 'Discord é obrigatório'] },
    protoframe: { type: String, required: [true, 'Protoframe é obrigatório'] },
    weapons: { type: [String], required: [true, 'Armas são obrigatórias'] },
    event: { type: String, default: 'Torneio PvP - Protoframes vs MK1' },
    registrationDate: { type: Date, default: Date.now },
    agreedToRules: { type: Boolean, default: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Modelo para armazenar os resultados das batalhas
const BattleSchema = new mongoose.Schema({
    event: String,
    battles: [{
        fighter1: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
        fighter2: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
        winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
        date: { type: Date, default: Date.now }
    }],
    created: { type: Date, default: Date.now }
});

// Modelo de Build
const BuildSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    type: { 
        type: String, 
        required: true, 
        enum: ['warframe', 'primary', 'secondary', 'melee', 'companion'] 
    },
    item: { 
        name: { type: String, required: true },
        image: { type: String },
        stats: { type: Object }
    },
    mods: [{
        name: { type: String, required: true },
        stats: { type: Object, required: true },
        isRiven: { type: Boolean, default: false },
        rivenName: { type: String },
        rivenStats: { type: String },
        rivenRank: { type: Number }
    }],
    description: { type: String },
    isPublic: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Criando os modelos
const User = mongoose.model('User', UserSchema);
const Bet = mongoose.model('Bet', BetSchema);
const GameSettings = mongoose.model('GameSettings', GameSettingsSchema);
const Registration = mongoose.model('Registration', RegistrationSchema);
const Battle = mongoose.model('Battle', BattleSchema);
const Build = mongoose.model('Build', BuildSchema);

/**************************************/
/* MIDDLEWARES */
/**************************************/

// Middleware de autenticação
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token não fornecido' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId);
        
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Usuário não encontrado' 
            });
        }

        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            error: 'Token inválido' 
        });
    }
};

// Middleware de admin
const checkAdmin = (req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ 
            success: false, 
            error: 'Acesso negado' 
        });
    }
    next();
};

/**************************************/
/* ROTAS DE AUTENTICAÇÃO */
/**************************************/

// Registrar usuário
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nome, email e senha são obrigatórios' 
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email já cadastrado' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const isFirstUser = (await User.countDocuments()) === 0;
        
        const user = new User({
            name,
            email,
            password: hashedPassword,
            isAdmin: isFirstUser
        });

        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
            expiresIn: '1d' 
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
                    isAdmin: user.isAdmin
                }
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao registrar usuário' 
        });
    }
});

// Login de usuário
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validação básica
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email e senha são obrigatórios' 
            });
        }

        // Busca usuário (email em minúsculas)
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Credenciais inválidas' 
            });
        }

        // Verifica senha
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                error: 'Credenciais inválidas' 
            });
        }

        // Gera token JWT
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
            expiresIn: '24h' 
        });

        // Resposta de sucesso
        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    balance: user.balance,
                    isAdmin: user.isAdmin
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro no servidor ao tentar login' 
        });
    }
});

/**************************************/
/* ROTAS PROTEGIDAS */
/**************************************/

// Obter informações do usuário atual
app.get('/api/user/me', authenticate, async (req, res) => {
    res.json({ 
        success: true, 
        data: req.user 
    });
});

// Fazer uma aposta
app.post('/api/bets', authenticate, async (req, res) => {
    try {
        const { warframeId, warframeName, amount } = req.body;

        if (!warframeId || !warframeName || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Dados da aposta incompletos' 
            });
        }

        if (amount < 5) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valor mínimo é 5 platina' 
            });
        }

        if (amount > req.user.balance) {
            return res.status(400).json({ 
                success: false, 
                error: 'Saldo insuficiente' 
            });
        }

        const bet = new Bet({
            userId: req.user._id,
            warframeId,
            warframeName,
            amount
        });

        req.user.balance -= amount;
        await req.user.save();
        await bet.save();

        res.status(201).json({ 
            success: true, 
            data: bet 
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar aposta' 
        });
    }
});

// Listar apostas do usuário
app.get('/api/bets', authenticate, async (req, res) => {
    try {
        const bets = await Bet.find({ userId: req.user._id }).sort({ date: -1 });
        res.json({ 
            success: true, 
            data: bets 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar apostas' 
        });
    }
});

/**************************************/
/* ROTAS PARA TORNEIO PVP */
/**************************************/

// Registrar para o torneio
app.post('/api/tournament/register', authenticate, async (req, res) => {
    try {
        const { nickname, mr, platform, discord, protoframe, weapons } = req.body;
        
        const requiredFields = ['nickname', 'mr', 'platform', 'discord', 'protoframe', 'weapons'];
        const missingFields = requiredFields.filter(field => !req.body[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Campos obrigatórios faltando: ${missingFields.join(', ')}`
            });
        }

        if (!Array.isArray(weapons) || weapons.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Selecione pelo menos uma arma'
            });
        }

        if (mr < 0 || mr > 40) {
            return res.status(400).json({
                success: false,
                error: 'MR deve estar entre 0 e 40'
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
            return res.status(400).json({
                success: false,
                error: 'Você já está registrado para este torneio'
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
            message: 'Inscrição realizada com sucesso!',
            data: newRegistration
        });
        
    } catch (error) {
        console.error('Erro ao salvar inscrição:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar inscrição',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Listar inscrições no torneio
app.get('/api/tournament/registrations', async (req, res) => {
    try {
        const registrations = await Registration.find().sort({ registrationDate: -1 });
        res.json({ 
            success: true,
            data: registrations 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Registrar resultado de batalha (apenas admin)
app.post('/api/tournament/battles', authenticate, checkAdmin, async (req, res) => {
    try {
        const newBattle = new Battle({
            event: req.body.event,
            battles: req.body.battles
        });

        await newBattle.save();
        
        res.status(201).json({
            success: true,
            message: 'Resultados das batalhas salvos com sucesso!'
        });
        
    } catch (error) {
        console.error('Erro ao salvar batalhas:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar resultados',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Listar batalhas
app.get('/api/tournament/battles', async (req, res) => {
    try {
        const battles = await Battle.find()
            .populate('battles.fighter1 battles.fighter2 battles.winner')
            .sort({ created: -1 });
            
        res.json({ 
            success: true,
            data: battles 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**************************************/
/* ROTAS PARA BUILD SHARING */
/**************************************/

// Criar nova build
app.post('/api/builds', authenticate, async (req, res) => {
    try {
        const { name, type, item, description, isPublic, mods } = req.body;
        
        if (!name || !type || !item?.name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Campos obrigatórios faltando: name, type, item.name' 
            });
        }
        
        const newBuild = new Build({
            userId: req.user._id,
            name,
            type,
            item: {
                name: item.name,
                image: item.image || null,
                stats: item.stats || {}
            },
            mods: mods || [],
            description: description || '',
            isPublic: isPublic !== undefined ? isPublic : true
        });
        
        await newBuild.save();
        
        res.status(201).json({ 
            success: true, 
            message: 'Build criada com sucesso!',
            data: newBuild
        });
    } catch (error) {
        console.error('Erro ao criar build:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar build',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Listar builds com filtros
app.get('/api/builds', async (req, res) => {
    try {
        const { userId, type, search, isPublic } = req.query;
        const query = {};
        
        if (userId) query.userId = userId;
        if (type) query.type = type;
        if (search) query.name = { $regex: search, $options: 'i' };
        if (isPublic !== undefined) query.isPublic = isPublic === 'true';
        
        const builds = await Build.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });
        
        res.json({ 
            success: true,
            data: builds 
        });
    } catch (error) {
        console.error('Erro ao buscar builds:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar builds',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Obter build específica
app.get('/api/builds/:id', async (req, res) => {
    try {
        const build = await Build.findById(req.params.id).populate('userId', 'name email');
        
        if (!build) {
            return res.status(404).json({ 
                success: false,
                error: 'Build não encontrada' 
            });
        }
        
        res.json({ 
            success: true,
            data: build 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar build',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Atualizar build
app.put('/api/builds/:id', authenticate, async (req, res) => {
    try {
        const build = await Build.findById(req.params.id);
        if (!build) {
            return res.status(404).json({ 
                success: false, 
                error: 'Build não encontrada' 
            });
        }
        
        if (build.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Não autorizado' 
            });
        }
        
        const { name, item, description, isPublic, mods } = req.body;
        
        build.name = name || build.name;
        build.item.name = item?.name || build.item.name;
        build.item.image = item?.image || build.item.image;
        build.item.stats = item?.stats || build.item.stats;
        build.description = description || build.description;
        build.mods = mods || build.mods;
        build.isPublic = isPublic !== undefined ? isPublic : build.isPublic;
        build.updatedAt = Date.now();
        
        await build.save();
        
        res.json({ 
            success: true, 
            message: 'Build atualizada com sucesso!',
            data: build
        });
    } catch (error) {
        console.error('Erro ao atualizar build:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar build',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Deletar build
app.delete('/api/builds/:id', authenticate, async (req, res) => {
    try {
        const build = await Build.findById(req.params.id);
        if (!build) {
            return res.status(404).json({ 
                success: false, 
                error: 'Build não encontrada' 
            });
        }
        
        if (build.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Não autorizado' 
            });
        }
        
        await build.deleteOne();
        
        res.json({ 
            success: true, 
            message: 'Build excluída com sucesso!' 
        });
    } catch (error) {
        console.error('Erro ao excluir build:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao excluir build',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**************************************/
/* ROTAS DE ADMIN */
/**************************************/

// Sortear ganhador do jogo
app.post('/api/game/draw', authenticate, checkAdmin, async (req, res) => {
    try {
        let settings = await GameSettings.findOne();
        if (!settings) {
            settings = new GameSettings();
            await settings.save();
        }

        const bets = await Bet.find();
        if (bets.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Não há apostas para sortear' 
            });
        }

        const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
        const winningNumber = Math.floor(Math.random() * 20) + 1;
        const winningBets = bets.filter(bet => bet.warframeId === winningNumber);
        const prizePool = settings.basePrize + (totalBetAmount * settings.multiplier);

        if (winningBets.length > 0) {
            const totalWinningAmount = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
            
            for (const bet of winningBets) {
                const user = await User.findById(bet.userId);
                if (user) {
                    const prize = (bet.amount / totalWinningAmount) * prizePool;
                    user.balance += prize;
                    await user.save();
                }
            }
        }

        settings.lastDraw = new Date();
        await settings.save();
        await Bet.deleteMany();

        res.json({ 
            success: true, 
            data: {
                winningNumber,
                prizePool,
                winnersCount: winningBets.length,
                winners: winningBets.map(bet => ({
                    userId: bet.userId,
                    amount: bet.amount
                }))
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao realizar sorteio' 
        });
    }
});


// Limpar todas as apostas
app.delete('/api/bets/all', authenticate, checkAdmin, async (req, res) => {
    try {
        await Bet.deleteMany();
        res.json({ 
            success: true, 
            message: 'Todas as apostas foram removidas' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao limpar apostas' 
        });
    }
});

// Atualizar configurações do jogo
app.put('/api/game/settings', authenticate, checkAdmin, async (req, res) => {
    try {
        const { basePrize, multiplier } = req.body;

        let settings = await GameSettings.findOne();
        if (!settings) {
            settings = new GameSettings();
        }

        if (basePrize !== undefined) {
            settings.basePrize = basePrize;
        }

        if (multiplier !== undefined) {
            settings.multiplier = multiplier;
        }

        await settings.save();

        res.json({ 
            success: true, 
            data: settings 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar configurações' 
        });
    }
});


// Adicionar saldo a um usuário (admin)
app.put('/api/users/:email/add-balance', authenticate, checkAdmin, async (req, res) => {
    try {
        const { amount } = req.body;
        const userEmail = req.params.email.toLowerCase();

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido para adicionar saldo'
            });
        }

        const user = await User.findOneAndUpdate(
            { email: userEmail },
            { $inc: { balance: amount } },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: `Saldo adicionado com sucesso para ${user.email}`,
            data: user
        });

    } catch (error) {
        console.error('Erro ao adicionar saldo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao adicionar saldo'
        });
    }
});

// Rota para obter todas as apostas (admin)
app.get('/api/bets/all', authenticate, checkAdmin, async (req, res) => {
    try {
        const bets = await Bet.find().populate('userId', 'name email');
        res.json({
            success: true,
            data: bets
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar apostas'
        });
    }
});
/**************************************/
/* ROTAS ESTÁTICAS */
/**************************************/

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bicho.html')));
app.get('/tournament', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tournament.html')));
app.get('/builder', (req, res) => res.sendFile(path.join(__dirname, 'public', 'builder.html')));

/**************************************/
/* MANIPULADOR DE ERROS */
/**************************************/

app.use((err, req, res, next) => {
    console.error('💥 Erro:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Erro interno no servidor',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

/**************************************/
/* INICIAR SERVIDOR */
/**************************************/

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Acesse: http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
    console.error('💥 Erro não tratado:', err);
});