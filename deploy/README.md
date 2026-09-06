# Implantação CREDNEX em Ubuntu / aaPanel

Servidor informado: `178.105.216.86`. O aaPanel está autenticado, e o SSH foi validado como `root`. O usuário do aaPanel não é um usuário Linux. As senhas fornecidas não fazem parte deste repositório.

## Estrutura

- `/opt/crednex/releases/ID`: versão compilada, imutável.
- `/opt/crednex/current`: link para a versão ativa.
- `/etc/crednex/crednex.env`: segredos de produção, modo 600, acesso root. Senha inicial do administrador gerada no servidor.
- `/var/lib/crednex/crednex.json`: banco persistente independente do release, usuário `crednex`.
- `/var/backups/crednex`: snapshots diários comprimidos, retenção de 30 dias.
- `crednex.service`: processo Node único, porta 4020 somente em loopback, limite de memória 512 MB.
- `crednex-backup.timer`: execução diária às 03:15 UTC.

Não executar múltiplas instâncias contra o arquivo JSON. Escala horizontal exige migração do armazenamento para banco transacional compartilhado. Os backups locais não substituem uma cópia externa; S3 ou outro destino requer configuração própria.

## Construir e instalar

Execute `npm run build` e `npm test` (o teste smoke precisa de `dist/` compilado) no ambiente de desenvolvimento. Empacote apenas `build/crednex-server.cjs`, `dist/` e `deploy/`, sem `.env`, `.data`, dependências ou contas de revisão. Copie o pacote via SCP e extraia para um novo diretório em `/opt/crednex/releases`.

```sh
bash /opt/crednex/releases/ID/deploy/install-release.sh /opt/crednex/releases/ID
systemctl status crednex --no-pager
curl --fail http://127.0.0.1:4020/api/health
```

O script cria o ambiente uma única vez, preserva dados e segredos, troca o link da versão ativa e verifica a saúde. Se a nova versão não responder, tenta voltar à versão anterior.

### Interface na Vercel e API no servidor

O push no GitHub atualiza a interface na Vercel. As chamadas `/api/*` são encaminhadas pelo `vercel.json` para este servidor: o backend também precisa ser publicado quando suas rotas mudam. Apenas publicar a interface pode exibir novos botões com erro `Rota não encontrada`.

Além do health, o instalador verifica a rota de exclusão sem autenticação e com identificador fictício: `DELETE /api/admin/users/deployment-probe` deve retornar **401**, nunca 404. Nenhuma conta é excluída nesse teste. Após instalar, repita a verificação em `https://crednex.vercel.app/api/admin/users/deployment-probe` para validar o encaminhamento público.

## Domínio e HTTPS

O sistema está publicado em https://178.105.216.86 com certificado público válido para o IP. `enable-ip-https.sh` usa Certbot em `/opt/crednex-acme`; `crednex-cert-renew.timer` verifica a renovação duas vezes ao dia. HTTP redireciona para HTTPS. Para migrar para um domínio:

1. Apontar o registro A do domínio escolhido para `178.105.216.86`; se houver AAAA, conferir o destino IPv6.
2. Substituir `CREDNEX_DOMAIN` em `nginx-live.conf.example` pelo domínio confirmado e instalar em `/etc/nginx/sites-available/crednex`.
3. Validar `nginx -t`, emitir certificado HTTPS com Certbot para o domínio autorizado e redirecionar HTTP para HTTPS.
4. Configurar `APP_PUBLIC_URL=https://DOMINIO` e as credenciais 2PP em `/etc/crednex/crednex.env`; reiniciar `crednex`.
5. Verificar autenticação, persistência, callback e renovação de certificado no endereço HTTPS.

## Integração 2PP

Fonte consultada: painel autenticado `https://2pp.online/dashboard/integration`, em 05/09/2026.

- Base: `https://webhookxxx.2pp.online`.
- Cobrança: `POST /api/v1/transactions/pix`.
- Headers: `X-API-Key` e `X-API-Secret`.
- Callback CREDNEX: `/api/webhooks/2pp?token=SEGREDO&depositId=REFERENCIA_LOCAL`; alias antigo `/api/webhooks/pixpay` preservado.
- Confirmação aceita: `data.status=COMPLETED`, identificador cadastrado e valor bruto exato. `netAmount` representa o líquido recebido pela empresa após taxas do provedor e não substitui o depósito bruto do participante.
- O adapter mantém nomes `PIXPAY_API_KEY`, `PIXPAY_API_SECRET`, `PIXPAY_BASE_URL` e `PIXPAY_WEBHOOK_TOKEN` por compatibilidade.
- O segredo atual não pode ser recuperado pelo painel. Não regenerar chaves compartilhadas sem avaliar as integrações existentes.
- Não foram enviados pagamentos reais. Saques continuam sujeitos à aprovação administrativa e pagamento externo na 2PP. A API de saída desconta taxas próprias em `netAmount`; automatizá-la exige definir a composição dessas taxas para preservar o líquido prometido ao participante.

## Operação e rollback

```sh
journalctl -u crednex -n 100 --no-pager
systemctl list-timers crednex-backup.timer
systemctl start crednex-backup.service
```

Para rollback, escolher um release existente, atualizar `/opt/crednex/current` e reiniciar `crednex`. O banco fica fora do release e não é revertido automaticamente. Restaurar backup de dados exige parar o serviço, preservar o arquivo atual e validar a versão a restaurar; não fazer isso como parte de rollback de código rotineiro.

## Validação em 06/09/2026

Release ativo: `20260906-2pp-02`. Build concluído e 26 testes aprovados. Credenciais fornecidas configuradas somente no ambiente de produção. HTTPS, página inicial e health retornaram HTTP 200; callback com token inválido retornou 401. Serviço, Nginx, backup e renovação automática ativos.

A consulta `GET /api/v1/currencies/crypto` retornou 200 tanto com credenciais quanto sem autenticação; ela verifica conectividade, mas não valida o par de chaves. `check-gateway.mjs` registra essa limitação e retorna falha quando a autenticação não pode ser comprovada. Nenhuma cobrança ou transferência real foi criada. A homologação completa requer uma cobrança PIX paga e a confirmação do crédito único pelo callback.
