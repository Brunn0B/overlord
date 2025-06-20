require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
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

// Conexão com MongoDB (string de conexão vem do .env)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

/**************************************/
/* MODELOS */
/**************************************/

// Modelo de Inscrição
const registrationSchema = new mongoose.Schema({
    nickname: { type: String, required: [true, 'Nickname é obrigatório'] },
    mr: { type: Number, min: 0, max: 40, required: [true, 'MR é obrigatório'] },
    platform: { type: String, required: [true, 'Plataforma é obrigatória'] },
    discord: { type: String, required: [true, 'Discord é obrigatório'] },
    protoframe: { type: String, required: [true, 'Protoframe é obrigatório'] },
    weapons: { type: [String], required: [true, 'Armas são obrigatórias'] },
    event: { type: String, default: 'Torneio PvP - Protoframes vs MK1' },
    registrationDate: { type: Date, default: Date.now },
    agreedToRules: { type: Boolean, default: true }
});

const Registration = mongoose.model('Registration', registrationSchema);

// Modelo para armazenar os resultados das batalhas
const battleSchema = new mongoose.Schema({
    event: String,
    battles: [{
        fighter1: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
        fighter2: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
        winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
        date: { type: Date, default: Date.now }
    }],
    created: { type: Date, default: Date.now }
});

const Battle = mongoose.model('Battle', battleSchema);

// Modelo de Build
const buildSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    type: { 
        type: String, 
        required: true, 
        enum: ['warframe', 'primary', 'secondary', 'melee', 'companion'] 
    },
    item: { 
        name: { type: String, required: true },
        image: { type: String }, // Armazenaremos a imagem como Base64
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

const Build = mongoose.model('Build', buildSchema);

/**************************************/
/* ROTAS ESTÁTICAS */
/**************************************/

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/inscricao.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'inscricao.html')));
app.get('/participantes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'participantes.html')));
app.get('/builder', (req, res) => res.sendFile(path.join(__dirname, 'public', 'builder.html')));

/**************************************/
/* ROTAS DE API PARA INSCRIÇÕES */
/**************************************/

app.post('/api/registrations', async (req, res) => {
    try {
        // Validação dos campos obrigatórios
        const requiredFields = ['nickname', 'mr', 'platform', 'discord', 'protoframe', 'weapons'];
        const missingFields = requiredFields.filter(field => !req.body[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Campos obrigatórios faltando: ${missingFields.join(', ')}`
            });
        }

        // Verifica se pelo menos uma arma foi selecionada
        if (!Array.isArray(req.body.weapons) || req.body.weapons.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Selecione pelo menos uma arma'
            });
        }

        // Verifica se o MR está dentro do intervalo válido
        if (req.body.mr < 0 || req.body.mr > 40) {
            return res.status(400).json({
                success: false,
                error: 'MR deve estar entre 0 e 40'
            });
        }

        // Cria o novo registro
        const newRegistration = new Registration({
            nickname: req.body.nickname,
            mr: req.body.mr,
            platform: req.body.platform,
            discord: req.body.discord,
            protoframe: req.body.protoframe,
            weapons: req.body.weapons,
            agreedToRules: req.body.agreedToRules || true
        });

        await newRegistration.save();
        
        res.status(201).json({
            success: true,
            message: 'Inscrição realizada com sucesso!',
            data: {
                id: newRegistration._id,
                nickname: newRegistration.nickname,
                protoframe: newRegistration.protoframe
            }
        });
        
    } catch (error) {
        console.error('Erro ao salvar inscrição:', {
            error: error.message,
            stack: error.stack,
            receivedData: req.body
        });
        
        res.status(500).json({
            success: false,
            error: 'Erro ao processar inscrição',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/api/registrations', async (req, res) => {
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

/**************************************/
/* ROTAS DE API PARA BATALHAS */
/**************************************/

app.post('/api/battles', async (req, res) => {
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

app.get('/api/battles', async (req, res) => {
    try {
        const battles = await Battle.find().populate('battles.fighter1 battles.fighter2 battles.winner').sort({ created: -1 });
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
/* ROTAS DE API PARA BUILDS */
/**************************************/

// Rota para buscar builds com filtros
app.get('/api/builds', async (req, res) => {
    try {
        const { userId, type, search, isPublic } = req.query;
        const query = {};
        
        if (userId) query.userId = userId;
        if (type) query.type = type;
        if (search) query.name = { $regex: search, $options: 'i' };
        if (isPublic !== undefined) query.isPublic = isPublic === 'true';
        
        const builds = await Build.find(query).sort({ createdAt: -1 });
        
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

// Rota para buscar uma build específica
app.get('/api/builds/:id', async (req, res) => {
    try {
        const build = await Build.findById(req.params.id);
        
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

// Rota para criar uma nova build
app.post('/api/builds', async (req, res) => {
    try {
        const { userId, name, type, item, description, isPublic, mods } = req.body;
        
        // Validação básica
        if (!userId || !name || !type || !item?.name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Campos obrigatórios faltando: userId, name, type, item.name' 
            });
        }
        
        // Criar nova build
        const newBuild = new Build({
            userId,
            name,
            type,
            item: {
                name: item.name,
                image: item.image || null, // Imagem em Base64
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

// Rota para atualizar uma build existente
app.put('/api/builds/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, name, item, description, isPublic, mods } = req.body;
        
        const build = await Build.findById(id);
        if (!build) {
            return res.status(404).json({ 
                success: false, 
                error: 'Build não encontrada' 
            });
        }
        
        // Verificar permissão
        if (build.userId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Não autorizado' 
            });
        }
        
        // Atualizar campos
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

// Rota para deletar uma build
app.delete('/api/builds/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        const build = await Build.findById(id);
        if (!build) {
            return res.status(404).json({ 
                success: false, 
                error: 'Build não encontrada' 
            });
        }
        
        // Verificar permissão
        if (build.userId !== userId) {
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
/* MIDDLEWARE DE ERRO */
/**************************************/

app.use((err, req, res, next) => {
    console.error('💥 Erro:', err);
    
    return res.status(500).json({ 
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
    console.log(`📝 Formulário: http://localhost:${PORT}/inscricao.html`);
    console.log(`👥 Participantes: http://localhost:${PORT}/participantes`);
    console.log(`🏗️ Builder: http://localhost:${PORT}/builder`);
});

process.on('unhandledRejection', (err) => {
    console.error('💥 Erro não tratado:', err);
});