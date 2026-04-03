const http = require('http');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  try {
    const url = 'http://localhost:3001/api/knowledge-tags?module=%E7%BB%84%E5%90%88%E6%A8%A1%E5%9D%97';
    console.log('请求URL:', url);
    console.log('解码模块名:', decodeURIComponent('%E7%BB%84%E5%90%88%E6%A8%A1%E5%9D%97'));
    console.log('');

    const data = await fetch(url);
    const tags = data.tags || [];

    console.log('API返回标签数:', tags.length);

    // 查找体育比赛
    const sports = tags.find(t => t.name === '体育比赛' && t.level === 3);
    console.log('\nAPI返回的体育比赛:');
    console.log('  id:', sports?.id);
    console.log('  name:', sports?.name);
    console.log('  level:', sports?.level);
    console.log('  module:', sports?.module);
    console.log('  parentId:', sports?.parentId);
    console.log('  children:', JSON.stringify(sports?.children));

    // 查找积分制标签
    const scoreTags = tags.filter(t => t.name?.includes('积分制'));
    console.log('\nAPI返回的积分制标签:');
    scoreTags.forEach(t => {
      console.log(`  - "${t.name}"`);
      console.log(`    id: ${t.id}`);
      console.log(`    parentId: ${t.parentId}`);
      console.log(`    level: ${t.level}`);
      console.log('');
    });

    // 检查parentId匹配
    console.log('parentId匹配检查:');
    scoreTags.forEach(t => {
      const matches = t.parentId === sports?.id;
      console.log(`  ${t.name}: parentId=${t.parentId?.slice(0,8)}..., 体育比赛ID=${sports?.id?.slice(0,8)}..., 匹配=${matches}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
