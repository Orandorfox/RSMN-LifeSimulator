// 模拟Next.js的环境变量加载
require('dotenv').config({ path: '.env.local' });

console.log('DASHSCOPE_API_KEY:', process.env.DASHSCOPE_API_KEY);
console.log('DASHSCOPE_HTTP_API_BASE:', process.env.DASHSCOPE_HTTP_API_BASE);
console.log('DASHSCOPE_IMAGE_MODEL:', process.env.DASHSCOPE_IMAGE_MODEL);
console.log('DASHSCOPE_IMAGE_PROMPT:', process.env.DASHSCOPE_IMAGE_PROMPT);
