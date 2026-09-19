//此文件的目的:让服务器跑起来,待别人访问
process.env.HF_ENDPOINT = 'https://hf-mirror.com';

//1.拿工具箱
import express from 'express'; //express是web服务器的工具箱
import cors from 'cors'; //cors是处理跨域请求的中间件
import dotenv from 'dotenv'; //dotenv读取.env文件
import multer from 'multer'; //引入文件上传包multer,名字定为multer


import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf =require('pdf-parse').pdf; //引入PDF解析包pdf-parse,名字定为pdf

import mammoth from 'mammoth'; //引入word解析包mammoth,名字定为mammoth
import fs from 'fs'; //引入读写文件包fs,名字定为fs 
//import {pipeline} from '@xenova/transformers'; //从...里把pipeline拿出来,跑AI任务
//const { text } = require('stream/consumers');
//const { normalize } = require('path');

//2.配置服务器
const upload = multer({dest: 'uploads'}); //用multer配置一个上传工具,名字定为upload,文件存到uploads目录
let documentText = ''; //定义一个空文本变量,名字定为documentText

dotenv.config(); //(默认去根目录)加载环境变量(.env文件),获取运行时的关键信息
const app = express(); //初始化一个服务器对象
const PORT = process.env.PORT || 5001; //读取端口号,没读到就用5000

if (!fs.existsSync('uploads')) { //如果没有uploads路径
    fs.mkdirSync('uploads'); //就创建一个
}

//定义全局变量
let documentChunks = []; //存放切片后的文本(chunks:大块)
let documentVectors = []; //存放每个切片的向量(vectors:向量)
let embedder = null; //声明一个空的向量模型

//3.定义路由和中间件规则(给服务器加功能)
//中间件:放行+解析
app.use(cors()); //服务器使用放行功能(允许其他域名访问)
app.use(express.json()); //服务器使用express框架的json解析功能

//测试服务是否正常
app.get('/', (req, res) => { //服务器获取到对/的get请求,自动获取请求和响应对象
    res.send('服务器跑起来了');}); //执行(函数):响应"服务器跑起来了"

//定义文本切片函数(将长文本按一段500字切开,前后重叠50字)
function splitText(text, chunkSize=500, overlap=80) { //定义切文本函数
    const chunks = []; //定义一个空数组集--块集合
    let start = 0; //定义一个起始点0

    while (start < text.length) { //当起始点不在末尾,就一直循环
        const end = Math.min(start + chunkSize, text.length); //在两点('始点+段长'和'文本结尾')之间取小点,记作终点
        chunks.push(text.slice(start, end)); //从start到end,放到数组chunks里
        start += chunkSize - overlap; //开始点重新算:500字 - 50字
    }

    return chunks; //返回切完的文本块
}

//初始化向量模型(只需执行一次)
async function initEmbedder() {
    if (!embedder) { //如果存模型的变量不存在(就开始初始化)
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowRemoteModels  = true; //允许联网
        env.localModelPath = 'https://hf-mirror.com'; //国内镜像
        //等待:用特征提取(文本转向量)和模型(Xenova),得到一个转换函数后,放到变量embdder里
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('向量化模型加载完成'); //打印输出
    }
}

//定义文本转向量函数
async function getEmbedding(text) {
    await initEmbedder(); //等待模型加载
    const output = await embedder(text, {pooling:'mean', normalize:true}); //等待转换函数将文本转为向量后,作为输出
    return Array.from(output.data); //输出数据转为数组,并输出
}

//计算两个向量的余弦相似度(输入两个向量,输出一个数字:(-1,1)之间1最相似)
function cosineSimilarity(vecA, vecB) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] ** 2;
        magB += vecB[i] ** 2;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB)); //公式
}

//定义函数(找出与问题最相似的topK个片段)
async function searchSimilar (query, topk = 3) { //参数:问题和片段数量
    const queryVector = await getEmbedding(query); //将问题转为向量
    const scores = documentVectors.map((vec, index) => ({ //遍历所有片段向量,将各个得分汇总成列表
        index,
        score: cosineSimilarity(queryVector, vec), //每个片段和问题向量的得分
    }));
    scores.sort((a, b) => b.score - a.score); //将所有的得分按照从高到低排序(变成了排序后的列表)
    return scores.slice(0, topk).map(item => documentChunks[item.index]); 
    //取前topk个分数记录,再遍历出对应的文本,并返回
}

//后端服务器(app)post(上传文件时触发)
//给路径'/api/upload'定义一个发送数据的接口,先让upload处理单个文件file,再执行异步函数)
app.post('/api/upload', upload.single('file'), async(req, res) => {
    try {
        const file = req.file; //将请求对象的文件,拿出来,定义为file
        let text = ''; //定义一个空文本,叫text

        if (file.mimetype === 'application/pdf') { //如果文件类型是pdf
            const data = await pdf(fs.readFileSync(file.path)); //先读取路径的文件,再解析,再存为data
            text = data.text; //将data的文字部分提取出来,存到text里
        } else if (file.mimetype.includes('word')) { //如果文件类型包含word
            const result = await mammoth.extractRawText({path:file.path}); //等待路径的文件解析完,存为result
            text = result.value; //将result的数组存到text里
        }

        documentText = text; //将text里的文本,存到documentText里
        fs.unlinkSync(file.path); //删除临时文件,释放磁盘空间

        //将文本切成片
        documentChunks = splitText(text); //将文本放进函数,存到documentChunks里
        console.log('切片数量:', documentChunks.length);
        console.log('第一段内容:', documentChunks[0]);

        //将每段文本向量化
        documentVectors = []; //清空旧向量
        for (const chunk of documentChunks) { //将文本切片一片一片取出来
            const vector = await getEmbedding(chunk); //用文本转向量函数将每个切片转为向量,记作vector
            documentVectors.push(vector); //将每个向量vector存到文本向量documentVectors里
        }
        console.log('向量数量:', documentVectors.length); //后台输出:...
        console.log('第一个向量的前五位:', documentVectors[0].slice(0, 5));  //后台输出:...

        res.json({message:'上传成功', length: text.length}); //响应对象显示json数据:...

    } catch(error) {
        console.error('上传失败:', error);
        res.status(500).json({error: error.message}); //响应对象调用500状态码,并显示json数据:错误信息
    }
});

//设置请求路由:处理聊天请求(用户提问时触发)
app.post('/api/chat', async (req, res) => { //当路由器接收到对chat的post请求时,执行异步函数(得到请求和响应对象):
    const {message} = req.body; //从请求体中提取内容,叫message

    if (!message) { //如果message没内容
        return res.status(400).json({error: '消息不能为空'}); //给响应对象返回状态400,并发送json格式的错误:消息不能为空
    }

    //找出与问题最相似的topK个片段
    const relevantChunks = await searchSimilar(message); //传入用户的信息,找出最相似的片段
    console.log('匹配到的片段:', relevantChunks);

    const context = relevantChunks.join('\n\n'); //将检索到的片段空一行拼成context
    const prompt = `你是一个严格基于文档回答问题的助手.请按照以下要求回答用户问题:
    【回答要求】
    1. 只使用下面提供的文档片段中的信息，不要使用你自己的知识
    2. 如果文档片段中没有相关信息，直接回答"文档中没有提到相关内容"，不要编造
    3. 回答时尽量引用原文的关键句子，让用户知道答案来自哪里
    4. 如果多个片段之间有矛盾，优先采用与问题最相关的那段
    5. 回答要简洁、直接，不要添加文档中没有的推测
    【文档片段】${context}
    【用户问题】${message}
    【你的回答】`; //整理成提示词

    try{ //(如果message有内容)尝试(向deepseek的聊天窗口发送post请求)
        const response = await fetch('https://api.deepseek.com/v1/chat/completions',{ //等待,从这个网址获取内容完成后,将其定义为响应对象
            method:'POST',  //方法是请求
            headers:{ //请求头为:
                'Content-Type': 'application/json', //内容类型为json
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` //钥匙:从环境里拿
            },
            body:JSON.stringify({ //请求体为:json形式的字符串
                model: 'deepseek-chat', //模型是deepseek-chat
                messages:[{role:'user', content:prompt}] //消息是:user用户发来的message
            })
        });

        const data = await response.json(); //等待:响应的内容转为json后,存到data里
        const reply = data.choices[0].message.content; //取出data的第一个内容的信息内容,叫reply
        res.json({reply}); //给响应对象返回reply的json格式
    } catch (error) { //(如果)捕捉到错误
        console.error('AI接口调用失败', error); //返回报错:'AI接口调用失败'
        res.status(500).json({error:'服务器错误,请稍后重试'}); //给响应对象500的状态,再给json内容:服务器错误,请稍后重试
    }
});

//4.启动监听(开始跑起来)
app.listen(PORT, () => { //服务器开始监听PORT的端口,监听到后,执行:
    console.log(`✅后端服务器已启动:http://localhost:${PORT}`) //输出'后端服务器已启动'
})
