# Finance Time 📈

Plataforma de análise de ações brasileiras (B3) com inteligência artificial, baseada nas estratégias dos maiores investidores do mundo.

## O que é

Finance Time busca dados reais do Yahoo Finance e usa o Claude AI (Anthropic) para analisar ações da B3 pelas estratégias de Graham, Barsi, Buffett, Lynch, Dalio, Munger e outros.

## Funcionalidades

- Análise fundamentalista com dados reais (P/L, P/VPA, ROE, Dividend Yield, etc.)
- IA que aplica estratégias de 10 investidores lendários
- Score por estratégia (Graham, Barsi, Buffett)
- Preço intrínseco estimado e margem de segurança
- Veredicto: COMPRAR / AGUARDAR / VENDER
- Chat com consultor IA focado em ações brasileiras
- Exclusivo para ações da B3 (sufixo `.SA`)

## Tecnologias

- **Backend:** Node.js + Express
- **Frontend:** HTML / CSS / JS puro
- **Dados:** Yahoo Finance API
- **IA:** Claude (Anthropic)
- **Hospedagem:** Railway

## Instalação local

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de variáveis
cp .env.example .env

# 3. Editar o .env e colocar sua chave
# ANTHROPIC_API_KEY=sk-ant-...

# 4. Rodar o servidor
npm start
```

Acesse em: `http://localhost:3000`

## Deploy no Railway

1. Faça push do projeto para um repositório no GitHub
2. Acesse [railway.app](https://railway.app) e crie um novo projeto a partir do repositório
3. Adicione a variável de ambiente `ANTHROPIC_API_KEY` no painel do Railway
4. Gere o domínio em **Settings → Networking → Generate Domain**

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic (obrigatório) |
| `PORT` | Porta do servidor (padrão: 3000) |

## Tickers suportados

Apenas ações brasileiras listadas na B3. Use sempre o sufixo `.SA`:

```
PETR4.SA  VALE3.SA  ITUB4.SA  BBDC4.SA
WEGE3.SA  TAEE11.SA BBSE3.SA  RADL3.SA
```

## Aviso

Este projeto é para fins **educacionais e informativos**. Não constitui recomendação de investimento. Consulte um profissional certificado antes de tomar decisões financeiras.
