// 测试API返回的数据结构
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
    // 获取模块列表
    const modulesRes = await fetch('http://localhost:3001/api/knowledge-tags');
    console.log('模块列表:', modulesRes.modules?.map(m => m.name) || '无法获取');

    // 获取组合模块下的标签
    const tagsRes = await fetch('http://localhost:3001/api/knowledge-tags?module=%E7%BB%84%E5%90%88%E6%A8%A1%E5%9D%97');
    const tags = tagsRes.tags || [];

    console.log('\n总标签数:', tags.length);

    // 查找体育比赛
    const sports = tags.find(t => t.name === '体育比赛' && t.level === 3);
    console.log('\n体育比赛:', {
      id: sports?.id,
      name: sports?.name,
      children: sports?.children
    });

    // 查找积分制标签
    const scoreTags = tags.filter(t => t.name.includes('积分制'));
    console.log('\n积分制标签:');
    scoreTags.forEach(t => {
      console.log('  -', t.name, 'parentId:', t.parentId?.slice(0, 8) + '...');
    });

    // 模拟前端buildTree
    const tagMap = new Map();
    const roots = [];

    tags.forEach(tag => {
      tagMap.set(tag.id, { ...tag, children: [] });
    });

    tags.forEach(tag => {
      const node = tagMap.get(tag.id);
      if (tag.parentId && tagMap.has(tag.parentId)) {
        const parent = tagMap.get(tag.parentId);
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // 检查体育比赛在树中的子节点
    const sportsInTree = tagMap.get(sports?.id);
    console.log('\n树中体育比赛的子节点数:', sportsInTree?.children?.length);
    sportsInTree?.children?.forEach(c => {
      console.log('  -', c.name);
    });

    // 检查前端渲染用的 hasChildren 判断
    console.log('\n前端 hasChildren 判断:');
    console.log('  sports.children:', sports?.children);
    console.log('  sports.children?.length:', sports?.children?.length);
    console.log('  hasChildren =', !!(sports?.children && sports.children.length > 0));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
