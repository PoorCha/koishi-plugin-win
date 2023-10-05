import { Context, Schema, Logger, Time } from 'koishi'

export const name = 'win'

export const usage = `更新后，用户可自行指定语录库的下载链接。我们为用户提供了两个链接，请按需复制（右键→复制链接）至下方配置中使用：\n
* 默认配置，国内可直连下载，但更新进度稍落后：
> https://eggs.gold/MCA/words.txt
* Github链接，更新频率高，但可能需要借助加速器下载：
> https://raw.githubusercontent.com/PoorCha/koishi-plugin-win/master/words.txt \n
语录库仅供娱乐目的使用，不存在对任何个人或集体的恶意，不包含敏感内容；请勿在群聊内利用本语录库**点评时事**或**发起人身攻击**。插件作者及语录整理者对因不适当使用而造成的损失概不负责。
`

export interface Config {
  sayingsUrl: string
  optionsOfAnotherFile?: string
  anotherFilePath?: string
  anotherFileShortcut?: string
  anotherReviewer: string
}

export const Config: Schema<Config> = Schema.object({
  sayingsUrl: Schema.string().default('https://eggs.gold/MCA/words.txt').description('张教授在线语录库的链接'),
  optionOfAnotherFile: Schema.string().description('若同时启用另一个语录库，则这里填写使用该语录库的ask指令选项，例如，这里填a，则调用该语录库的指令就是ask -a'),
  anotherFilePath: Schema.string().description('若同时启用另一个语录库，则这里填写其地址'),
  anotherFileShortcut: Schema.string().description('若同时启用另一个语录库，则这里填写其快捷匹配，省去群友手敲指令的麻烦'),
  anotherReviewer: Schema.string().description('若同时启用另一个语录库，则这里填写评价者的名称，以免使张教授ooc（bushi）'),
})

export const logger = new Logger('win');

export const using = ['console', 'database']

const fs = require('fs');

const iconv = require('iconv-lite');

const chardet = require('chardet');

const https = require('https');

const wordsFile = 'words.tmp';//临时文件名称

//let lastDownloadTime = null;//用于存储上一次更新语录库的时间

declare module 'koishi' {
  interface Tables {
    zvv: zvv
    //random_events: random_events
  }
}

export interface zvv {
  id: number
  targetId: string //用户账号
  targetName: string //用户名，用于排行时展示
  month: number
  day: number
  win: number
  group: number
  winLater: boolean //共同富win功能中，用于标识双赢者
  miniWinDays: number //精准扶win功能中，用于标识小赢天数
}


export function apply(ctx: Context, config: Config) {
  registerCommand(ctx, config);
  ctx.model.extend('zvv', {
    // 记录各群各人win情况
    id: 'unsigned',
    targetId: 'string',
    targetName: 'string',
    month: 'integer',
    day: 'integer',
    win: 'integer',
    group: 'integer',
    winLater: 'boolean',
    miniWinDays: 'integer'
  }, {
    autoInc: true,
  }
  )
}
async function getRandom() {
  //获取1-100随机数
  const num = Math.floor(Math.random() * (100 - 1 + 1)) + 1;
  return num;
}
async function getWin(num) {
  //获取赢的结果，概率分别为2、48、25、17、5、2、1，此外还有num为1与2时的微赢。
  //const win = ['灵活赢', '小赢', '中赢', '大赢', '特大赢', '赢麻了','输'];
  let result = 0;
  if (num >= 100) result = 6;
  else if (num >= 98) result = 5;
  else if (num >= 93) result = 4;
  else if (num >= 76) result = 3;
  else if (num >= 51) result = 2;
  else if (num >= 3) result = 1;
  //else result = 0;
  return result;
}
async function getDate() {
  //返回当前日期
  const date = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  date[0] = month;
  date[1] = day;
  return date;
}

function getRandomElement(array) {
  //用于从数组中抽取随机元素
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

async function getInterpret(date, name, newWin, winIndex, rate, hasTargetedWinAlleviation) {
  //解读赢的结果，其中newWin表示是否今日刚赢
  const month = date[0], day = date[1];
  const win = ['灵活赢。', '小赢。', '中赢。', '大赢。', '特大赢。', '赢麻了。', '输！'];
  const msg = [
    ['维为寄语：我真的觉得我们千万不能太天真。', '维为寄语：好像真的要出大问题。', '维为寄语：自己都不一定保得住。', '维为寄语：现在这个水准还是太低了。'],
    ['维为寄语：只要你自信，怎么表达都可以。', '维为寄语：我们一点都不害怕竞争。', '维为寄语：我们的回旋余地特别大。', '维为寄语：很显然就是觉得不服气。'],
    ['维为寄语：我想更精彩的故事还在后面。', '维为寄语：这使美国感到害怕了。', '维为寄语：现在确实在开始超越美国了。', '维为寄语：至少美国今天还做不到。'],
    ['维为寄语：这个趋势还会持续下去。', '维为寄语：我们已经不是一般的先进了。', '维为寄语：我们不是一般的领先，对不对？', '维为寄语：别人都不可能超越我们。', '维为寄语：很好地展示了一种自信。'],
    ['维为寄语：这是中国崛起最精彩的地方。', '维为寄语：我们已经对美国形成了巨大的压力。', '维为寄语：必须给美国迎头痛击！', '维为寄语：你真可能会创造世界奇迹的。', '维为寄语：这种自信令人有点回味无穷。'],
    ['维为寄语：已经震撼了这个世界！', '维为寄语：这是一种发自内心的钦佩。', '维为寄语：这种震撼效果前所未有。', '维为寄语：至今引以为荣。'],
    ['教授寄语：你赢赢赢，最后是输光光。']
  ];
  const targetedWinAlleviationMsg = ['维为寄语：我们手中的牌太多了。', '维为寄语：现在我们有很多新的牌可以打。', '维为寄语：该出手的时候一定要出手。','维为寄语：局面马上就打开了。']
  if (hasTargetedWinAlleviation) {
    let result = '';
    result += '恭喜 ' + name + ' 在' + date[0] + '月' + date[1] + '日受到精准扶win，赢的程度提高40%！\n' + name + ' 当前赢的程度是：' + rate + '%，属于';
    return result + win[winIndex] + '\n' + getRandomElement(targetedWinAlleviationMsg);
  }
  if (!newWin && rate > 2) {
    let result = '你已经在' + month + '月' + day + '日赢过了，请明天再继续赢。\n你今天赢的程度是：' + rate + '%，属于';
    return result + win[winIndex];
  }
  else {
    let result = '';
    result += '恭喜 ' + name + ' 在' + date[0] + '月' + date[1] + '日又赢了一次！\n' + name + ' 赢的程度是：' + rate + '%，属于';
    return result + win[winIndex] + '\n' + getRandomElement(msg[winIndex]);
  }
}

async function CommonProsperity(ctx, session, rate) {
  //共同富裕，只有在榜一是大赢时才能帮扶
  const date = await getDate();//获取当前日期，数组下标0为月份，1为日期
  let result = await ctx.database.get('zvv', {
    month: date[0],
    day: date[1],
    group: session.guildId
  }, ['targetId', 'targetName', 'win']);//查出的内容包括用户账号及赢的程度
  let winnest = 0;
  let winnester = '';
  let winnestId = '';
  result.forEach((item) => {
    if (item.win > winnest) {
      winnest = item.win;
      winnester = item.targetName;
      winnestId = item.targetId;
    }
  });//找出最赢的人

  if (winnest < 76) {
    //榜一不是大赢以上
    await session.sendQueued('最赢者不够努力，没有达到大赢的程度，无力帮扶。');
    return [-1, ''];
  }

  const nowWin = Math.round((winnest + rate) / 2);
  await session.sendQueued('恭喜 ' + session.author.username + ' 在 ' + winnester + ' 的帮扶下实现共同富win，赢的程度达到了' + nowWin + '%！', 2 * Time.second);
  return [nowWin, winnestId];
}

async function isTargetIdExists(ctx, targetId, group) {
  //检查数据表中是否有指定id者
  const targetInfo = await ctx.database.get('zvv', { targetId: targetId, group: group });
  return targetInfo.length !== 0;
}

function transform(arr) {
  //用于将日期存入数组
  let newArr = [];
  arr.forEach((item) => {
    newArr[0] = item.month;
    newArr[1] = item.day;
    newArr[2] = item.win;//这里的win是被抽到的随机数
  });
  return newArr;
}

function getRandomLineFromFile(filePath) {
  //从字典中抽取一行作为评价输出
  const fileContent = fs.readFileSync(filePath); // 以二进制形式读取文件
  const decodedContent = iconv.decode(fileContent, 'utf8'); // 使用utf8解码文件内容
  const lines = decodedContent.split('\n');// 以换行符分割
  const randomIndex = Math.floor(Math.random() * lines.length);

  let result = lines[randomIndex];
  if (result.endsWith('\r')) {
    result = result.slice(0, -1); // 去除最后一个换行符
  }
  return result;
}

async function downloadFile(url, destination) {
  //下载语录库，并转换编码至utf8
  return new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https.get(url, { rejectUnauthorized: false }, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const encoding = chardet.detectFileSync(destination);
          if (encoding !== 'utf8') {
            const fileContent = fs.readFileSync(destination);
            const decodedContent = iconv.decode(fileContent, encoding);
            const utf8Content = iconv.encode(decodedContent, 'utf8');
            fs.writeFileSync(destination, utf8Content);
            exports.logger.info('文件编码不是utf8，已转换完毕。');
          }
          resolve();
        });
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => reject(err));
    });
  });
}

function extractRandomLine() {
  //历史遗留
  const line = getRandomLineFromFile(wordsFile);
  return line;
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function registerCommand(ctx, config) {
  /*
   * 定义赢指令。
   */
  ctx.command('win', '查询今日有多赢，每群每人每日仅抽一次\n若用户当日抽到“微赢”，则可触发“共同富win”，当日可再抽一次，赢的程度将与该群大赢以上的榜一平分。')
    .action(async ({ session }) => {

      if (isNaN(session.guildId)) {
        await session.sendQueued('独赢赢不如众赢赢，请在群组内使用该指令。');
        return;
      }
      const id = session.userId;//获取发送者的用户id

      const date = await getDate(); //获取当前日期，数组下标0为月份，1为日期
      const isExists = await isTargetIdExists(ctx, id, session.guildId); //该群中的该用户是否赢过
      if (isExists) { //若该群中的该用户存在，则获取其上一次赢的日期
        let last = await ctx.database.get('zvv', { targetId: id, group: session.guildId }, ['month', 'day', 'win']); //获取用户id上一次赢的日期

        let lastWin = transform(last);

        //let newWin = true;//标识是否今日刚赢
        if (lastWin[0] == date[0] && lastWin[1] == date[1]) { //日期为今日日期，说明今日已经赢过
          //newWin = false;
          let rate = lastWin[2];
          if (rate <= 2) {
            //若win的程度是微赢，则共同富win，返回当前win值以更新表
            let temp = await CommonProsperity(ctx, session, rate);//temp[0]即被帮扶者当前win值，temp[1]即榜一id
            if (temp[0] == -1) {
              //返回-1说明榜一大赢未至，无力帮扶
              return;
            }
            //更新被帮扶者信息
            exports.logger.success(`Set a new row in zvv table because id: ${id} in the group: ${session.guildId} in date: ${date[0]}-${date[1]} has enjoyed the fruits of common prosperity, nowWin: ${temp[0]}. `);
            await ctx.database.set('zvv', { targetId: id, group: session.guildId }, {
              targetName: session.author.username,
              month: date[0],
              day: date[1],
              win: temp[0],
              winLater: true
            });
            //更新榜一信息
            exports.logger.success(`Set a new row in zvv table because id: ${temp[1]} in the group: ${session.guildId} in date: ${date[0]}-${date[1]} has win-win with ${id}. `);
            await ctx.database.set('zvv', { targetId: temp[1], group: session.guildId }, {
              winLater: true
            });
            return;
          }
          let win = await getWin(rate);//与win的结果所对应的下标
          await session.sendQueued(await getInterpret(date, session.author.username, false, win, rate,false), 2 * Time.second);
        }
        else {//用户存在且今日未赢，则做更新
          let win = 0;
          let rate = await getRandom();//这里的rate是被抽到的随机数，下面的win则代表赢的结果

          let hasTargetedWinAlleviation = false;
          //查出小赢的天数
          let temp = await ctx.database.get('zvv', { targetId: id, group: session.guildId }, 'miniWinDays');
          let miniWin = 0;
          temp.forEach((item) => {
            miniWin = item.miniWinDays;
          });
          //exports.logger.info('miniWin = ' + miniWin);
          if (miniWin >= 3) {//若连续小赢超过3天，则在当日赢的基础上加40%
            let temp = rate + 40;
            rate = temp > 100 ? 100 : temp;
            exports.logger.info(`Id: ${id} in the group: ${session.guildId} has mini-wined ${miniWin} days, so today his win will be ${rate}. `);
            await ctx.database.set('zvv', { targetId: id, group: session.guildId }, {
              miniWinDays: 0
            });//重置天数
            hasTargetedWinAlleviation = true;
          }

          win = await (getWin(rate)); //获取赢的结果
          exports.logger.success(`Set a new row in zvv table because isExists = ${isExists} and lastWin = ${lastWin[0]}-${lastWin[1]}. id: ${id}, group: ${session.guildId}, date: ${date[0]}-${date[1]}, rate: ${rate}. `);
          await ctx.database.set('zvv', { targetId: id, group: session.guildId }, {
            targetName: session.author.username,
            month: date[0],
            day: date[1],
            win: rate,
            winLater: false
          });//更新数据，小赢天数则在前后单独计算

          if (win == 1) {//如果赢的程度是小赢，则将该用户的miniWinDays字段加1，其中也包括受帮扶后的小赢
            await ctx.database.set('zvv', { targetId: id, group: session.guildId }, {
              miniWinDays: { $add: [{ $: 'miniWinDays' }, 1] }
            });
          } else {//否则归零
            await ctx.database.set('zvv', { targetId: id, group: session.guildId }, {
              miniWinDays: 0
            });
          }

          await session.sendQueued(await getInterpret(date, session.author.username, true, win, rate, hasTargetedWinAlleviation), 2 * Time.second); //解读赢的结果并发送至消息队列
          return;
        }
      }
      else { //用户不存在，在表中插入一行
        let win = 0;
        let rate = await getRandom();
        win = await (getWin(rate)); //获取赢的结果
        exports.logger.success(`Create a new row in zvv table because isExists = ${isExists}. id: ${id}, group: ${session.guildId}, date: ${date[0]}-${date[1]}, rate: ${rate}.`);
        await ctx.database.create('zvv', {
          targetId: id,
          targetName: session.author.username,
          month: date[0],
          day: date[1],
          win: rate,
          group: session.guildId,
          winLater: false,
          miniWinDays: (win == 1) ? 1 : 0
        });
        await session.sendQueued(await getInterpret(date, session.author.username, true, win, rate,false), 2 * Time.second);
        return;
      }
    });

  ctx.command('rank', '查看当前群win情况的排行')
    .option('detail', '-d 展示本群win情况的统计信息。')
    .action(async ({ session, options }) => {
      //需先查出该群当天赢的人数
      const date = await getDate(); //获取当前日期，数组下标0为月份，1为日期
      let result = await ctx.database.get('zvv', {
        month: date[0],
        day: date[1],
        group: session.guildId
      }, ['targetId', 'targetName', 'win', 'winLater']); //查出的内容包括用户账号及赢的程度，以及是否受过帮扶

      if (result.length === 0) {
        await session.sendQueued('本群今日还没有人赢，请在至少一人赢过后再试。');
        return;
      }

      let newArr = [];
      result.forEach((item) => {
        let tempArr = [];
        tempArr[0] = item.targetId;
        tempArr[1] = item.targetName;
        tempArr[2] = item.win;
        tempArr[3] = item.winLater;
        newArr.push(tempArr);
      }); //将查出的结果存入newArr数组
      newArr.sort((a, b) => b[2] - a[2]); //定义以按win降序排列的方式排序
      //let newArr = getTodayWinList(ctx, session);

      if (options.detail) {
        /*查看更详细的统计数据，此时今日赢的情况已降序存储于newArr中
          统计最大值（Maximum Value）、最小值（Minimum Value）、平均值（Average）、
          中位数（Median）、极差（Range）、方差（Variance）、标准差（Standard Deviation）
        */

        //从newArr中单独提取win结果
        const winValues = newArr.map(item => item[2]);

        // 平均值
        const sum = winValues.reduce((acc, val) => acc + val, 0);
        const averageValue = sum / winValues.length;

        // 中位数
        const sortedValues = winValues.sort((a, b) => a - b);
        const middleIndex = Math.floor(sortedValues.length / 2);
        const medianValue = sortedValues.length % 2 === 0 ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2 : sortedValues[middleIndex];

        // 极差
        const rangeValue = winValues[newArr.length - 1] - winValues[0];

        // 方差
        const squaredDifferences = winValues.map(val => Math.pow(val - averageValue, 2));
        const varianceValue = squaredDifferences.reduce((acc, val) => acc + val, 0) / winValues.length;

        // 标准差
        const standardDeviationValue = Math.sqrt(varianceValue);

        //今日win人数
        const toll = newArr.length;

        const output = `${session.guildName}（${session.guildId}）今日共有${toll}人赢了。\n` +
          `其中，赢的程度最高者是：${newArr[0][1]}（${newArr[0][0]})，其赢的程度为${newArr[0][2]}%；\n` +
          `最低者是：${newArr[toll - 1][1]}（${newArr[toll - 1][0]})，其赢的程度为${newArr[toll - 1][2]}%。\n` +
          `本群今日总win值的平均值为${averageValue.toFixed(2)}，中位数为${medianValue}，极差为${rangeValue}，方差为${varianceValue.toFixed(2)}，标准差为${standardDeviationValue.toFixed(2)}。`;

        await session.sendQueued(output);
        return;
      }

      let output = '';
      newArr.forEach((item) => {
        let winLater = '';
        if (item[3]) winLater += '（共赢）';
        output += ' - ' + item[1] + '（' + item[0] + '）：' + item[2] + '%' + winLater + '\n';
      });
      await session.sendQueued(session.guildName + '（' + session.guildId + '）今日的win排行如下：\n' + output, 5 * Time.second);
    });

  ctx.command('ask [arg:string]')
    .alias('评价')
    .option('another', `-${config.optionOfAnotherFile} 通过自定义选项指定另一个语录库。`)
    .shortcut(`${config.anotherFileShortcut}`, { fuzzy: true, options: { another: true } })//为调用新语录库配置别名
    .action(async ({ session, options }, arg) => {
      //传入一个事件，获取张教授对该事件的评价
      let something = (arg === undefined) ? '' : arg;
      let cmt = '';
      let rvwr = '';//评论者
      if (!options.another) {
        //没有指定另一个语录库的路径，则从默认语录库中抽取
        try {
          const randomLine = extractRandomLine();
          rvwr += '张教授';
          cmt += randomLine;
          if (!arg) session.sendQueued(rvwr + '的评价是：' + cmt, 1 * Time.second);
          else session.sendQueued(rvwr + '对' + something + '的评价是：' + cmt, 1 * Time.second);
        } catch {
          session.execute(`ask.update`);
          sleep(2000).then(() => {
            session.execute(`ask ${something}`);
          })
        }
        return;
      }
      else {
        //从指定语录库中抽取
        rvwr = `${config.anotherReviewer}`;
        cmt += getRandomLineFromFile(config.anotherFilePath);
        if (!arg) await session.sendQueued(rvwr + '的评价是：' + cmt, 1 * Time.second);
        else await session.sendQueued(rvwr + '对' + arg + '的评价是：' + cmt, 1 * Time.second);
        return;
      }
    });

  ctx.command('ask.update')
    .alias('更新语录库')
    .action(async ({ session }) => {
      // 将更新语录库功能拆分出来
      //session.sendQueued('123:' + config.sayingsUrl);
      downloadFile(config.sayingsUrl, wordsFile)
      exports.logger.success('语录库更新完成。');
      //session.sendQueued('语录库更新完成。');
      return;
    });
}
