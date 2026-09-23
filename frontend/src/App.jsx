//这是控制层文件,目的是:链接用户操作和后端数据
import {useState} from 'react';
import './App.css';

//第一步:搭建最简单的组件骨架（确保能显示）：function，return，export
//第二步：（加3个state）准备存数据
//第三步：搭UI结构（把头部header、躯干main、底部footer位置占好）
//第四步：渲染消息messages列表（将对话内容变成画面）
//第五步：输入框input绑定（让输入框能打字）
//第六步:实现sendMessage函数(处理发送逻辑)

function App() {
    const [messages, setMessages] = useState([]); //存对话记录
    const [input, setInput] = useState(''); //存输入框文字
    const [isLoading, setIsLoading] = useState(false); //存加载状态

    const sendMessage = async () => { //定义发送信息常量:执行异步函数
        if (!input.trim()) return; //如果输入的信息去除首尾空格还是没内容,就返回空

        //(如果有内容,执行以下)
        const userMessage = {role:'user', content:input}; //将用户的输入定位需要发送的信息
        setMessages(prev => [...prev, userMessage]); //将需要发送的信息放到信息列表后面
        setInput(''); //清空输入框
        setIsLoading(true); //显示加载成功

        try { //开始尝试
            const response = await fetch('https://ai-knowledge-base-uped.onrender.com/api/chat', { //向此地址请求,等待完后,定义为响应对象
                method:'POST', //请求方法
                headers:{'Content-Type': 'application/json'}, //请求头:json内容
                body:JSON.stringify({message:input}), //请求体:输入信息的json字符串
            });

            //(拿到响应对象后)
            const data = await response.json(); //等待响应对象的json格式,定义为数据
            const botMessage = {role:'assistant', content:data.reply}; //将系统和数据的答复部分作为回复的信息
            setMessages(prev => [...prev, botMessage]); //将回复的信息放到信息列表后面
        } catch (error) { //如果报错
            console.error('请求失败:', error); //发送错误信息:请求失败
            const errorMessage = {role: 'assistant', content:'请求失败,请重试'}; //形成错误信息:系统的,请求失败
            setMessages(prev => [...prev, errorMessage]) //将错误信息,缀到信息列表后面
        } finally { //最终
            setIsLoading(false); //将加载状态设置为结束
        };
    };

    const uploadFile = async (e) => { //上传文件事件(异步函数)
        const file = e.target.files[0]; //拿到触发事件的那个元素的第一个文件
        
        if (!file) return; //如果没有文件就退出
        const formData = new FormData(); // (如果有文件，就)新建一个包裹
        formData.append('file', file); //将文件装到包裹里

        try { //尝试(向后端服务区发送请求,带着请求方法和包裹)
            const response = await fetch('https://ai-knowledge-base-uped.onrender.com/api/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json(); //等待相应后的json内容，叫data
            alert('文档已上传，共提取' + data.length + '个字符'); //弹窗(...)
        } catch (error) {  //(如果)报错
            alert('上传失败'); //(就)弹窗(上传失败)
        }
    };

    return (
        <div className="app">
            <header><h1>AI 知识库</h1></header> 
            <main className="chat-area">
                {messages.map((msg, index) => ( //遍历消息列表
                    <div key={index} className={`message ${msg.role}`}>
                        {msg.content}
                    </div>
                ))}
                {/*如果isloading为true,就显示思考中 */}
                {isLoading && <div className="message assistant">思考中...</div>}
            </main>
            <footer className="input-area">
                <input type="file" accept=".pdf,.doc,.docx" onChange={uploadFile} />
                <input
                    value={input} //（当用户）输入内容
                    onChange={(e) => setInput(e.target.value)} //输入框变成内容
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()} //敲回车发送
                />
                <button onClick={sendMessage} disabled={isLoading}>发送</button>
            </footer>
        </div>
    );
}

export default App;
