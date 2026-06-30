const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Caminho do arquivo que servirá como nosso Banco de Dados
const DATA_FILE = path.join(__dirname, 'usuarios.json');

// Função auxiliar para ler os dados do arquivo de forma segura
function lerBanco() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            // Se o arquivo não existir, cria a estrutura inicial com a conta do dono
            const estruturaInicial = {
                bancaDono: 0.00,
                vouchers: {},
                usuarios: {
                    "admin": { username: "admin", senha: "123", saldo: 0.00, isAdmin: true, minesAtivo: null }
                }
            };
            fs.writeFileSync(DATA_FILE, JSON.stringify(estruturaInicial, null, 4));
            return estruturaInicial;
        }
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        console.error("Erro ao ler banco de dados:", e);
        return { bancaDono: 0.00, vouchers: {}, usuarios: {} };
    }
}

// Função auxiliar para salvar os dados no arquivo
function salvarBanco(dados) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(dados, null, 4));
    } catch (e) {
        console.error("Erro ao salvar banco de dados:", e);
    }
}

// Itens do jogo Tigrinho
const chavesItens = ['WILD', 'OURO', 'ENVELOPE', 'FOGOS', 'LARANJA'];

// ==================== ROTAS DE AUTENTICAÇÃO ====================

// Rota de Cadastro
app.post('/api/auth/cadastro', (req, res) => {
    const { username, senha } = req.body;
    if (!username || !senha) return res.status(400).json({ erro: 'Preencha todos os campos.' });

    const userLimpo = username.trim().toLowerCase();
    const db = lerBanco();

    if (db.usuarios[userLimpo]) {
        return res.status(400).json({ erro: 'Este utilizador já existe.' });
    }

    // Cria o novo jogador com saldo inicial de 1000 reais para teste
    db.usuarios[userLimpo] = {
        username: userLimpo,
        senha: senha.trim(),
        saldo: 1000.00,
        isAdmin: false,
        minesAtivo: null
    };

    salvarBanco(db);
    res.json({ sucesso: true, username: userLimpo });
});

// Rota de Login
app.post('/api/auth/login', (req, res) => {
    const { username, senha } = req.body;
    const userLimpo = username.trim().toLowerCase();
    const db = lerBanco();

    const utilizador = db.usuarios[userLimpo];
    if (!utilizador || utilizador.senha !== senha.trim()) {
        return res.status(400).json({ erro: 'Utilizador ou senha incorretos.' });
    }

    res.json({ 
        sucesso: true, 
        username: utilizador.username, 
        isAdmin: utilizador.isAdmin 
    });
});

// Rota para buscar os dados atualizados do utilizador
app.post('/api/utilizador/dados', (req, res) => {
    const { username } = req.body;
    const db = lerBanco();
    const utilizador = db.usuarios[username?.toLowerCase()];

    if (!utilizador) return res.status(404).json({ erro: 'Utilizador não encontrado.' });

    res.json({ 
        saldo: utilizador.saldo, 
        isAdmin: utilizador.isAdmin,
        bancaDono: db.bancaDono 
    });
});

// ==================== ROTAS DO TIGRINHO ====================
app.post('/api/jogar-tiger', (req, res) => {
    let { aposta, username } = req.body;
    aposta = parseFloat(aposta);
    const userLimpo = username?.toLowerCase();

    const db = lerBanco();
    const utilizador = db.usuarios[userLimpo];

    if (!utilizador) return res.status(404).json({ erro: 'Utilizador não autenticado.' });
    if (isNaN(aposta) || aposta < 1 || aposta > 10000) return res.status(400).json({ erro: 'Aposta inválida.' });
    if (utilizador.saldo < aposta) return res.status(400).json({ erro: 'Saldo insuficiente.' });

    // Deduz do saldo do jogador e manda direto para a banca do dono!
    utilizador.saldo -= aposta;
    db.bancaDono += aposta;

    const randomKey = () => chavesItens[Math.floor(Math.random() * chavesItens.length)];
    let mFinal = [
        [randomKey(), randomKey(), randomKey()],
        [randomKey(), randomKey(), randomKey()],
        [randomKey(), randomKey(), randomKey()]
    ];

    // 35% de chance de vitória
    if (Math.random() < 0.35) {
        const escolhido = chavesItens[Math.floor(Math.random() * 3) + 2];
        mFinal = [[escolhido, 'WILD', escolhido], [randomKey(), escolhido, randomKey()], [escolhido, escolhido, 'WILD']];
    }

    let ganhou = false;
    let multTotal = 0;

    for (let i = 0; i < 3; i++) {
        let c1 = mFinal[0][i], c2 = mFinal[1][i], c3 = mFinal[2][i];
        if ((c1 === c2 && c2 === c3) || (c1 === 'WILD' && c2 === c3) || (c2 === 'WILD' && c1 === c3)) {
            ganhou = true;
            multTotal += 5;
        }
    }

    let premio = 0;
    if (ganhou) {
        premio = aposta * multTotal;
        utilizador.saldo += premio; // O prêmio é gerado na conta dele, sem tirar do seu lucro
    }

    salvarBanco(db);

    res.json({
        sucesso: true,
        matriz: mFinal,
        ganhou: ganhou,
        premio: premio,
        novoSaldo: utilizador.saldo
    });
});

// ==================== ROTAS DO MINES ====================
app.post('/api/mines/iniciar', (req, res) => {
    let { aposta, minas, username } = req.body;
    aposta = parseFloat(aposta);
    minas = parseInt(minas);
    const userLimpo = username?.toLowerCase();

    const db = lerBanco();
    const utilizador = db.usuarios[userLimpo];

    if (!utilizador) return res.status(404).json({ erro: 'Utilizador inválido.' });
    if (isNaN(aposta) || aposta < 1 || utilizador.saldo < aposta) return res.status(400).json({ erro: 'Saldo insuficiente.' });
    if (isNaN(minas) || minas < 1 || minas > 24) return res.status(400).json({ erro: 'Minas inválidas.' });

    // Deduz do jogador e soma no lucro do dono
    utilizador.saldo -= aposta;
    db.bancaDono += aposta;

    const tabuleiro = Array(25).fill('diamante');
    let bombasColocadas = 0;
    while (bombasColocadas < minas) {
        let idx = Math.floor(Math.random() * 25);
        if (tabuleiro[idx] !== 'bomba') {
            tabuleiro[idx] = 'bomba';
            bombasColocadas++;
        }
    }

    utilizador.minesAtivo = {
        aposta,
        minas,
        tabuleiro,
        revelados: [],
        multiplicador: 1.00
    };

    salvarBanco(db);
    res.json({ sucesso: true, novoSaldo: utilizador.saldo });
});

app.post('/api/mines/revelar', (req, res) => {
    const { index, username } = req.body;
    const db = lerBanco();
    const utilizador = db.usuarios[username?.toLowerCase()];

    if (!utilizador || !utilizador.minesAtivo) return res.status(400).json({ erro: 'Nenhum jogo ativo.' });
    
    const jogo = utilizador.minesAtivo;
    if (jogo.revelados.includes(index)) return res.status(400).json({ erro: 'Casa já revelada.' });

    jogo.revelados.push(index);

    if (jogo.tabuleiro[index] === 'bomba') {
        utilizador.minesAtivo = null; // Perdeu o jogo
        salvarBanco(db);
        return res.json({ perdeu: true, tabuleiroCompleto: jogo.tabuleiro });
    }

    const totalCasasRegulamentares = 25 - jogo.minas;
    const progresso = jogo.revelados.length / totalCasasRegulamentares;
    jogo.multiplicador += parseFloat((progresso * 1.5 * (jogo.minas / 3)).toFixed(2));

    salvarBanco(db);
    res.json({ perdeu: false, tipo: 'diamante', proximoPremio: jogo.aposta * jogo.multiplicador });
});

app.post('/api/mines/cashout', (req, res) => {
    const { username } = req.body;
    const db = lerBanco();
    const utilizador = db.usuarios[username?.toLowerCase()];

    if (!utilizador || !utilizador.minesAtivo || utilizador.minesAtivo.revelados.length === 0) {
        return res.status(400).json({ erro: 'Ação inválida.' });
    }

    const jogo = utilizador.minesAtivo;
    const valorGanho = jogo.aposta * jogo.multiplicador;
    
    utilizador.saldo += valorGanho;
    utilizador.minesAtivo = null;

    salvarBanco(db);
    res.json({ sucesso: true, ganho: valorGanho, novoSaldo: utilizador.saldo });
});

// ==================== SISTEMA DE VOUCHERS E ADMIN ====================
app.post('/api/admin/gerar-voucher', (req, res) => {
    const { token, valor } = req.body;
    const db = lerBanco();
    
    const tk = 'GOLD-' + (token ? token.trim().toUpperCase() : Math.random().toString(36).substring(2, 7).toUpperCase());
    db.vouchers[tk] = parseFloat(valor);
    
    salvarBanco(db);
    res.json({ token: tk, valor });
});

app.post('/api/resgatar-voucher', (req, res) => {
    const { token, username } = req.body;
    if (!token) return res.status(400).json({ erro: 'Digite um código.' });
    
    const tk = token.trim().toUpperCase();
    const db = lerBanco();
    const utilizador = db.usuarios[username?.toLowerCase()];

    if (!utilizador) return res.status(404).json({ erro: 'Utilizador inválido.' });
    
    if (db.vouchers[tk]) {
        utilizador.saldo += db.vouchers[tk];
        delete db.vouchers[tk];
        salvarBanco(db);
        res.json({ sucesso: true, novoSaldo: utilizador.saldo });
    } else {
        res.status(400).json({ erro: 'Código inválido ou já utilizado.' });
    }
});

// Rota de gerenciamento do dono (Alterar saldo de qualquer um)
app.post('/api/admin/modificar-saldo', (req, res) => {
    const { adminUser, alvoUser, novoSaldo } = req.body;
    const db = lerBanco();

    if (!db.usuarios[adminUser?.toLowerCase()]?.isAdmin) {
        return res.status(403).json({ erro: 'Acesso negado.' });
    }

    const alvo = db.usuarios[alvoUser?.toLowerCase()];
    if (!alvo) return res.status(404).json({ erro: 'Jogador não encontrado.' });

    alvo.saldo = parseFloat(novoSaldo);
    salvarBanco(db);
    res.json({ sucesso: true, username: alvoUser, novoSaldo: alvo.saldo });
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
