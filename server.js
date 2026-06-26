const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados temporário na memória do servidor
let bancoDados = {
    saldo: 1000.00,
    vouchers: {},
    minesAtivo: null // Guarda o estado do jogo Mines atual
};

// Itens do jogo Tigrinho
const chavesItens = ['WILD', 'OURO', 'ENVELOPE', 'FOGOS', 'LARANJA'];

// Rota para buscar o saldo atual seguro
app.get('/api/saldo', (req, res) => {
    res.json({ saldo: bancoDados.saldo });
});

// ==================== ROTAS DO TIGRINHO ====================
app.post('/api/jogar-tiger', (req, res) => {
    let { aposta } = req.body;
    aposta = parseFloat(aposta);

    if (isNaN(aposta) || aposta < 1 || aposta > 10000) {
        return res.status(400).json({ erro: 'Aposta inválida.' });
    }
    if (bancoDados.saldo < aposta) {
        return res.status(400).json({ erro: 'Saldo insuficiente.' });
    }

    bancoDados.saldo -= aposta;

    const randomKey = () => chavesItens[Math.floor(Math.random() * chavesItens.length)];
    let mFinal = [
        [randomKey(), randomKey(), randomKey()],
        [randomKey(), randomKey(), randomKey()],
        [randomKey(), randomKey(), randomKey()]
    ];

    // 35% de chance de forçar ganho
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
        bancoDados.saldo += premio;
    }

    res.json({
        sucesso: true,
        matriz: mFinal,
        ganhou: ganhou,
        premio: premio,
        novoSaldo: bancoDados.saldo
    });
});

// ==================== ROTAS DO MINES ====================
app.post('/api/mines/iniciar', (req, res) => {
    let { aposta, minas } = req.body;
    aposta = parseFloat(aposta);
    minas = parseInt(minas);

    if (isNaN(aposta) || aposta < 1 || bancoDados.saldo < aposta) {
        return res.status(400).json({ erro: 'Aposta inválida ou saldo insuficiente.' });
    }
    if (isNaN(minas) || minas < 1 || minas > 24) {
        return res.status(400).json({ erro: 'Quantidade de minas inválida.' });
    }

    bancoDados.saldo -= aposta;

    // Gerar tabuleiro oculto com as bombas (0 a 24)
    const tabuleiro = Array(25).fill('diamante');
    let bombasColocadas = 0;
    while (bombasColocadas < minas) {
        let idx = Math.floor(Math.random() * 25);
        if (tabuleiro[idx] !== 'bomba') {
            tabuleiro[idx] = 'bomba';
            bombasColocadas++;
        }
    }

    bancoDados.minesAtivo = {
        aposta,
        minas,
        tabuleiro,
        revelados: [],
        multiplicador: 1.00
    };

    res.json({ sucesso: true, novoSaldo: bancoDados.saldo });
});

app.post('/api/mines/revelar', (req, res) => {
    if (!bancoDados.minesAtivo) return res.status(400).json({ erro: 'Nenhum jogo ativo.' });
    
    const { index } = req.body;
    const jogo = bancoDados.minesAtivo;

    if (jogo.revelados.includes(index)) return res.status(400).json({ erro: 'Casa já revelada.' });

    jogo.revelados.push(index);

    if (jogo.tabuleiro[index] === 'bomba') {
        bancoDados.minesAtivo = null; // Perdeu tudo
        return res.json({ perdeu: true, tabuleiroCompleto: jogo.tabuleiro });
    }

    // Calcular multiplicador simples baseado nas revelações bem-sucedidas
    const totalCasasRegulamentares = 25 - jogo.minas;
    const progresso = jogo.revelados.length / totalCasasRegulamentares;
    jogo.multiplicador += parseFloat((progresso * 1.5 * (jogo.minas / 3)).toFixed(2));

    res.json({ perdeu: false, tipo: 'diamante', proximoPremio: jogo.aposta * jogo.multiplicador });
});

app.post('/api/mines/cashout', (req, res) => {
    if (!bancoDados.minesAtivo || bancoDados.minesAtivo.revelados.length === 0) {
        return res.status(400).json({ erro: 'Ação inválida.' });
    }

    const jogo = bancoDados.minesAtivo;
    const valorGanho = jogo.aposta * jogo.multiplicador;
    
    bancoDados.saldo += valorGanho;
    bancoDados.minesAtivo = null;

    res.json({ sucesso: true, ganho: valorGanho, novoSaldo: bancoDados.saldo });
});


// ==================== SISTEMA DE VOUCHERS ====================
app.post('/api/admin/gerar-voucher', (req, res) => {
    const { senha, valor } = req.body;
    if (senha !== 'ghost123') return res.status(403).json({ erro: 'Acesso negado' });
    
    const token = 'GOLD-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    bancoDados.vouchers[token] = parseFloat(valor);
    res.json({ token, valor, lista: bancoDados.vouchers });
});

app.post('/api/resgatar-voucher', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ erro: 'Digite um código.' });
    const tk = token.trim().toUpperCase();
    
    if (bancoDados.vouchers[tk]) {
        bancoDados.saldo += bancoDados.vouchers[tk];
        delete bancoDados.vouchers[tk];
        res.json({ sucesso: true, novoSaldo: bancoDados.saldo });
    } else {
        res.status(400).json({ erro: 'Código inválido ou já utilizado.' });
    }
});

app.listen(PORT, () => console.log(`Servidor privado rodando na porta ${PORT}`));