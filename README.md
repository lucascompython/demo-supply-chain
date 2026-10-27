# Demonstracao local de um supply chain attack

Uma app Node.js usa `mathlib` através de ESM (`import` e `export`). As contas
continuam corretas nas três branches. Na comprometida, a biblioteca lê o `.env`
na instalação e na chamada a `add()`. O conteúdo aparece entre aspas no terminal.
Não há envio pela rede nem recolha de outros ficheiros. Os dados são fictícios.

## Ambiente e preparação

Testado em Arch Linux, Node.js **26.10.0**, npm **12.2.0** e Git **2.56.0**.
A aplicação é de terminal, sem serviços, portas ou registo npm privado.
O pacote é um `.tgz` local criado com `npm pack`; o ensaio funciona offline.
Não há Express, dotenv ou dependências adicionais.

Neste computador os binários de sistema estão em `/usr/bin`. Seleciona-os
apenas nesta sessão, na raiz do repositório:

```sh
export PATH="/usr/bin:$PATH"
node --version
npm --version
cp app/.env.example app/.env
cd app
```

Os dois comandos de versão devem indicar `v26.10.0` e `12.2.0` neste ambiente.
Noutras máquinas, usa uma versão Node compatível com npm 12 e confirma as
versões antes do ensaio. `engine-strict=true` recusa ferramentas incompatíveis.
Não é preciso alterar a configuração permanente da shell.

O `.env` fica fora do Git e contém três linhas reais:

```dotenv
STRIPE_KEY=sk_123456789
MELHOR_PROFESSOR=Hugo Almeida ;)
API_KEY=987654321
```

O `.env.example` permite reproduzir estes valores. O código comprometido usa
`readFileSync` diretamente; ignorar um ficheiro no Git não impede a sua leitura.

| Branch | mathlib | Comportamento |
| --- | --- | --- |
| `normal` | 1.0.0 | Só funções matemáticas |
| `comprometida` | 1.0.1 | `postinstall` e `add()` leem o `.env` |
| `corrigida` | 1.0.2 | Código revisto, scripts bloqueados e origem limitada |

A app mantém o mesmo `index.js` nas três branches. Os manifestos, os artefactos
e os lockfiles mudam para representar a adoção de outra versão.

## 1. Versão normal (dentro de app/)

```sh
git switch normal
npm ci --foreground-scripts
npm start
```

Obténs `2 + 3 = 5`, `9 - 4 = 5`, `6 * 7 = 42`, `8 / 2 = 4`, sem o `.env`.
Os dois `package.json` usam `"type": "module"`.

## 2. Versão comprometida (continuar em app/)

```sh
git switch comprometida
npm ci --foreground-scripts
npm start
```

A instalação mostra `[DEMO:postinstall]` e o conteúdo entre aspas. Depois,
`npm start` mostra `[DEMO:runtime:add]` e o mesmo conteúdo, mantendo as contas.
Por exemplo:

```text
[DEMO:runtime:add] Leitura indevida de app/.env
"STRIPE_KEY=sk_123456789
MELHOR_PROFESSOR=Hugo Almeida ;)
API_KEY=987654321"
2 + 3 = 5
```

`postinstall.js` chama `capture-env.js` na instalação; `add()` chama a mesma
rotina durante a utilização. O alvo é apenas o `.env` da app consumidora,
resolvido com `new URL('../../.env', import.meta.url)` na biblioteca instalada.
`--foreground-scripts` torna visível o output; não autoriza a execução.

**Por que corre o hook com npm 12?** Esta branch representa uma atualização
aprovada sem revisão suficiente. O `app/package.json` permite explicitamente
os scripts do artefacto comprometido:

```json
"allowScripts": {
  "file:../packages/mathlib-1.0.1.tgz": true
}
```

Nos pacotes locais, a política identifica a origem pelo caminho do `.tgz`.
Uma chave só com o nome `mathlib` não aprova este tarball. A branch normal
aprova o seu próprio artefacto 1.0.0, que não tem scripts de instalação.
A aprovação é uma decisão de confiança, não uma análise do código.

## 3. Correção parcial: bloquear só scripts (ainda em comprometida)

```sh
npm ci --ignore-scripts --foreground-scripts
npm start
```

O hook deixa de correr, mas `add()` continua a ler o `.env`. `--ignore-scripts`
tem prioridade sobre a aprovação; não impede o script explicitamente pedido
com `npm start` nem o código importado pela app.

Sem uma entrada correspondente em `allowScripts`, o npm 12 também bloqueia o
hook por omissão, mesmo com `ignore-scripts=false`. O verificador testa esse
caso numa cópia temporária, retirando a aprovação com `npm pkg delete allowScripts`.
A biblioteca continua instalada e a leitura em runtime mantém-se.

## 4. Versão corrigida (continuar em app/)

```sh
git switch corrigida
npm ci --foreground-scripts
npm start
npm config get ignore-scripts
```

As contas mantêm os mesmos resultados, não aparece o `.env` e a configuração
mostra `true`. A versão 1.0.2 remove as duas leituras. O `.env` continua no
mesmo sítio e com o mesmo conteúdo.

Medidas aplicadas, relacionadas com o relatório:

- Código revisto, sem `postinstall.js`, `capture-env.js` ou leitura em `add()`.
- `ignore-scripts=true` e negação explícita do artefacto em `allowScripts`.
- Dependência fixada em `mathlib-1.0.2.tgz`, com lockfile e SHA-512 no Git.
- Instalação limpa com `npm ci` e `save-exact=true` para futuras dependências.
- `allow-git=none`, `allow-remote=none`, `allow-directory=none` e `allow-file=root`.
  Este último permite o tarball declarado diretamente no `package.json`.

`offline=true` mantém o ensaio local; `audit=false` evita consultas de auditoria
neste laboratório; `fund=false` reduz a saída. Não recomendamos desativar as
auditorias num projeto real. A integridade também é válida na versão maliciosa:
um hash correto não demonstra que o código é benigno.

A idade mínima de sete dias não é avaliada nestes tarballs sem data de
publicação num registo. Proveniência, OIDC e assinaturas ficam como propostas
para um pipeline real. O npm 12 permite rever pendências com
`npm approve-scripts --allow-scripts-pending`; aprovar exige revisão prévia.

## Verificação e evidências

Na branch corrigida, a partir da raiz do repositório:

```sh
cd ..
node scripts/verificar.mjs
```

O verificador usa cópias temporárias das três branches, o `.env.example` e uma
cache vazia por ensaio. Não muda a branch de trabalho nem usa o teu `.env`.
Confirma seis situações: normal, comprometida com aprovação, bloqueio com
`ignore-scripts`, corrigida, rejeição de um tarball alterado e bloqueio por
omissão do npm 12 sem aprovação. Os logs reais ficam em `docs/evidencias/`.
A verificação precisa das três branches locais.

Para comparar o código, na raiz:

```sh
git diff normal..comprometida -- mathlib app
git diff comprometida..corrigida -- mathlib app
```

Para empacotar novamente após uma alteração intencional:

```sh
cd mathlib
npm pack --ignore-scripts --offline --pack-destination ../packages
```

Revê o artefacto e atualiza a dependência, a política e o lockfile de forma
controlada. Não é preciso empacotar para apresentar a demonstração.

## Reflexão e resposta

Testes funcionais das contas passam mesmo com exposição do `.env`. O bloqueio
de hooks protege a instalação, mas não o runtime. As proteções do npm 12
reduzem execuções automáticas, mas uma aprovação indevida pode autorizá-las.

Num incidente real: parar o uso da versão, preservar logs e artefactos,
revogar/rodar credenciais expostas, reconstruir de uma versão revista e
investigar desenvolvimento e CI. Os marcadores são prova didática, não uma
regra geral de deteção; uma biblioteca real pode ocultar a saída e usar a rede.

## Fontes técnicas

- [npm pack (npm 12)](https://docs.npmjs.com/cli/v12/commands/npm-pack/)
- [Scripts (npm 12)](https://docs.npmjs.com/cli/v12/using-npm/scripts/)
- [npm ci (npm 12)](https://docs.npmjs.com/cli/v12/commands/npm-ci/)
- [Configuração (npm 12)](https://docs.npmjs.com/cli/v12/using-npm/config/)
- [Aprovação de scripts (npm 12)](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts/)

A política de tarballs foi também confirmada no código do npm 12.2.0 instalado
(`@npmcli/arborist/lib/script-allowed.js`) e nos ensaios. Documentação consultada
com Context7 e ferramenta web integrada em 27/10/2026.
