/**
 * 简单的并发限流队列，用于图片库封面生成（zip/cbz/epub 解压是同步阻塞操作，
 * 不像视频库缩略图那样用 execFile 起独立进程，而是直接在 Node 主线程里跑）。
 *
 * 首页一次性渲染几十上百个文件夹卡片时，如果不限流，会瞬间触发同样多个同步解压
 * 任务，把主进程事件循环连续占满好几秒甚至更久，表现为整个软件卡死无响应。
 *
 * 这里做两件事：
 *   1. 限制同时执行的任务数（concurrency），排队等候，不要一窝蜂全冲上去
 *   2. 每个任务执行前用 setImmediate 让出一次事件循环，给主进程机会处理
 *      其他排队中的 IPC 消息/窗口重绘，避免长时间连续同步阻塞
 *
 * 注意：这不能让单次 zip 解压本身变成"非阻塞"（adm-zip 内部就是同步读文件），
 * 只能避免"几百个同步任务背靠背瞬间执行完才吐出控制权"这种最坏情况。
 * 如果以后库特别大（几千个压缩包）还是会卡，那就得考虑用 child_process/
 * utilityProcess 把解压挪到独立进程里，这个眼下先不做。
 */
export class ConcurrencyQueue {
  private running = 0
  private waiters: Array<() => void> = []

  constructor(private concurrency: number) {}

  async run<T>(task: () => T | Promise<T>): Promise<T> {
    await this.acquire()
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      return await task()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++
      return Promise.resolve()
    }
    return new Promise(resolve => {
      this.waiters.push(() => { this.running++; resolve() })
    })
  }

  private release(): void {
    this.running--
    const next = this.waiters.shift()
    if (next) next()
  }
}

// 封面生成（含 zip/cbz/epub 解压）统一走这个队列，同时最多 2 个任务在跑
export const coverQueue = new ConcurrencyQueue(2)

// 视频库"递归统计文件夹视频总数"（countVideosRecursive）也要走限流队列。
// 单次操作只是 fs.readdirSync，比 zip 解压便宜得多，所以并发数给高一点（6），
// 但库很大、文件夹层级很深时，首页一次性对几百个文件夹同时发起递归统计，
// 依然会在主进程里排起长队的同步 readdir 调用，一样会造成"卡片全部消失、
// 界面无响应"的假死现象——原理和压缩包解压卡死完全一样，只是量级更大才会触发。
export const scanQueue = new ConcurrencyQueue(6)

// PDF 封面渲染（pdftoppm 走独立进程，不会阻塞主线程，但同时起太多进程还是
// 会抢 CPU/内存，给个并发上限；比 zip 那条队列宽松一些，因为不占用 Node 主线程）
export const pdfQueue = new ConcurrencyQueue(3)
