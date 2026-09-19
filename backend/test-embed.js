//测试脚本:测试能否自动下载模型

import { pipeline, env } from '@xenova/transformers';

env.allowRemoteModels = true;
env.remoteHost = 'https://hf-mirror.com';

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await embedder('测试文本', { pooling: 'mean', normalize: true });
console.log('向量维度:', output.data.length);