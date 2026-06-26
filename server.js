const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados temporário na memória do servidor
let bancoDados = {
    saldo: 1000.00,
    vouchers: {}
};

// Itens do jogo
const chavesItens = ['WILD', 'OURO', 'ENVELOPE', 'FOGOS', 'LARANJA'];

// Rota para buscar o saldo atual seguro
app.get('/api/saldo', (req, res) => {
    res.json({ saldo: bancoDados.saldo });
});

// Rota protegida: O sorteio é processado aqui no servidor
app.post('/api/jogar-tiger', (req, res) => {
    let { aposta } = req.body;
    aposta = parseFloat(aposta);

    if (isNaN(aposta) || aposta < 1 || aposta > 10000) {
        return res.status(400).json({ erro: 'Aposta inválida.' });
    }
    if (bancoDados.saldo < aposta) {
        return res.status(400).json({ erro: 'Saldo insuficiente.' });
    }

    // Deduz o valor da aposta
    bancoDados.saldo -= aposta;

    // Sorteio dos rolos feito no servidor
    const randomKey = () => chavesItens[Math.floor(Math.random() * chavesItens.length)];
    let mFinal = [
        [randomKey(), randomKey(), randomKey()],
        [randomKey(), randomKey(), randomKey()],
        [randomKey(), randomKey(), randomKey()]
    ];

    // Forçador algorítmico de ganho controlado (35% de chance)
    if (Math.random() < 0.35) {
        const escolhido = chavesItens[Math.floor(Math.random() * 3) + 2];
        mFinal = [[escolhido, 'WILD', escolhido], [randomKey(), escolhido, randomKey()], [escolhido, escolhido, 'WILD']];
    }

    // Verificação de vitória
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

// Gerar cupom (Admin)
app.post('/api/admin/gerar-voucher', (req, res) => {
    const { senha, valor } = req.body;
    if (senha !== 'ghost123') return res.status(403).json({ erro: 'Acesso negado' });
    
    const token = 'GOLD-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    bancoDados.vouchers[token] = parseFloat(valor);
    res.json({ token, valor, lista: bancoDados.vouchers });
});

// Resgatar cupom
app.post('/api/resgatar-voucher', (req, res) => {
    const { token } = req.body;
    const tk = token.trim().toUpperCase();
    if (bancoDados.vouchers[tk]) {
        bancoDados.saldo += bancoDados.vouchers[tk];
        delete bancoDados.vouchers[tk];
        res.json({ sucesso: true, novoSaldo: bancoDados.saldo });
    } else {
        res.status(400).json({ erro: 'Código inválido ou já utilizado.' });
    }
});

// Inicialização do Servidor
app.listen(PORT, () => console.log(`Servidor privado rodando na porta ${PORT}`));