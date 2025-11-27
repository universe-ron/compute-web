// trading-bot.js
const { ethers } = require('ethers');
const { createZGComputeNetworkBroker } = require('@0glabs/0g-serving-broker');
const fetch = require('node-fetch'); // HTTP 请求库

// 配置（测试网）
const PRIVATE_KEY = 'YOUR_PRIVATE_KEY'; // 替换为你的私钥
const RPC_URL = 'https://evmrpc-testnet.0g.ai'; // 0G 测试网 RPC
const BINANCE_API = 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT'; // Binance 价格 API
const PROVIDER_ADDRESS = '0x...EXAMPLE_PROVIDER_ADDRESS'; // 从合约或 demo 获取（见扩展）
const MODEL_NAME = 'gpt-4o-mini'; // 示例模型，从元数据获取
const CHAT_ID = 'trading-chat-' + Date.now(); // 唯一聊天 ID

async function main() {
  // 步骤 1: 创建钱包和 Broker（参考 demo & 文档）
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  console.log('Broker initialized.');

  // 步骤 2: Ledger 资金管理（确保有 A0GI 支付推理费，参考 demo）
  const amount = ethers.utils.parseEther('0.01'); // 示例 0.01 A0GI
  await broker.ledger.addLedger(amount);
  await broker.ledger.depositFund(amount);
  const ledgerInfo = await broker.ledger.getLedgerWithDetail();
  console.log('Ledger funded:', ledgerInfo);

  // 步骤 3: 服务发现 & 提供者验证（参考 demo）
  const metadata = await broker.inference.getServiceMetadata(PROVIDER_ADDRESS);
  console.log('Provider metadata:', metadata.endpoint, metadata.models);

  await broker.inference.acknowledge(PROVIDER_ADDRESS);
  const isAcknowledged = await broker.inference.userAcknowledged(PROVIDER_ADDRESS);
  if (!isAcknowledged) {
    throw new Error('Provider acknowledgment failed');
  }
  console.log('Provider verified.');

  // 步骤 4: 获取交易所信息（Binance API）
  const priceResponse = await fetch(BINANCE_API);
  const priceData = await priceResponse.json();
  const currentPrice = priceData.price;
  console.log(`BTCUSDT 当前价格: $${currentPrice}`);

  // 步骤 5: 构建 AI 提示（注入价格数据）
  const messages = [
    {
      role: 'system',
      content: '你是一个交易助手。基于价格数据，给出买入/卖出/持有的建议，包括理由、入场/出场点和风险评估。'
    },
    {
      role: 'user',
      content: `当前 BTCUSDT 价格: $${currentPrice}。请提供交易建议。`
    }
  ];

  // 步骤 6: 构建请求（参考 demo：headers、模型、URL）
  const endpoint = metadata.endpoint; // 提供者 URL
  const payload = { messages, model: MODEL_NAME, stream: false }; // 非流式
  const payloadStr = JSON.stringify(payload);
  const headers = await broker.inference.getRequestHeaders(PROVIDER_ADDRESS, payloadStr); // 认证 headers

  // 步骤 7: 发送请求到提供者（HTTP POST，参考 demo）
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: payloadStr
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.statusText}`);
  }

  const responseData = await response.json();
  const content = JSON.stringify(responseData.choices[0].message.content); // 提取内容

  // 步骤 8: 处理 & 验证响应（参考 demo）
  const isValid = await broker.inference.processResponse(PROVIDER_ADDRESS, content, CHAT_ID);
  if (!isValid) {
    throw new Error('响应验证失败');
  }

  // 步骤 9: 输出交易建议
  console.log('交易建议:', responseData.choices[0].message.content);
}

main().catch(console.error);