# koishi-plugin-win

[![npm](https://img.shields.io/npm/v/koishi-plugin-win?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-win)

- 我们又赢了！
- win指令
  - 使用名为“zvv”的数据表记录每天用户赢的结果，并限制每日只能赢一次
  - 其概率分别为：灵活赢 - 2%，小赢 - 48%，中赢 - 25%、大赢 - 17%、特大赢 - 5%、赢麻了 - 2%、[数据删除] - 1%
  - “共同富win”功能：win程度为1~2%时的结果为“灵活赢”，抽到“灵活赢”的用户当天可以再抽一次，赢的程度与当前最赢者（必须大赢及以上，否则失败）平分
- rank指令
  - 用于获取当前群的赢程度排行。
  - 可选参数d或detail，可用于查看当前群win情况的统计数据
  - 被“共同富win”功能“帮扶”过的用户与当前榜一，在排行榜中会被标注为“共赢”
- ask指令
  - 后跟参数，可以让张教授做出评价
  - 该功能的实现使用在线语录库，目前已上传至[github](https://raw.githubusercontent.com/PoorCha/koishi-plugin-win/master/words.txt)，不再需要手动下载
  - 语录库默认12小时下载一次，目前包含300余条，足以做出多样的评价
  - 提供让用户使用本地自定义语录库的功能，只需简单的配置即可

<br><br>
用户自定义语录库应当是utf8编码，否则输出会乱码。