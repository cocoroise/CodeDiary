// import { noop } from 'shared/util'
// import { handleError } from './error'
// import { isIOS, isNative } from './env'

const callbacks = [];
let pending = false;

//这里就是简单的遍历一下callbacks并执行
function flushCallbacks() {
  pending = false;
  const copies = callbacks.slice(0);
  callbacks.length = 0;
  for (let i = 0; i < copies.length; i++) {
    copies[i]();
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
// 宏任务和微任务都有些小问题，这里默认用的是微任务，但是也暴露了一个调用宏任务的方法(withMacrotASK)
let microTimerFunc;
let macroTimerFunc;
let useMacroTask = false;

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */

//底层用setImmediate实现
if (typeof setImmediate !== "undefined" && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks);
  };
} // 如果没有就用messageChanner
else if (
  typeof MessageChannel !== "undefined" &&
  (isNative(MessageChannel) ||
    // PhantomJS
    MessageChannel.toString() === "[object MessageChannelConstructor]")
) {
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = flushCallbacks;
  macroTimerFunc = () => {
    port.postMessage(1);
  };
} else {
  /* istanbul ignore next */
  // 再不行就直接用setTimeout(0)
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0);
  };
}

// Determine microtask defer implementation.
// 微任务队列使用promise实现
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== "undefined" && isNative(Promise)) {
  const p = Promise.resolve();
  microTimerFunc = () => {
    p.then(flushCallbacks);
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop);
  };
} else {
  // 没有promise降级为 macro
  microTimerFunc = macroTimerFunc;
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask(fn: Function): Function {
  return (
    fn._withTask ||
    (fn._withTask = function() {
      useMacroTask = true;
      const res = fn.apply(null, arguments);
      useMacroTask = false;
      return res;
    })
  );
}

// 用于一次性更改一堆需要渲染的东西，传入的是一个数组
export function nextTick(cb?: Function, ctx?: Object) {
  let _resolve;
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, "nextTick");
      }
    } else if (_resolve) {
      _resolve(ctx);
    }
  });
  //一次性执行一个队列 优化性能
  if (!pending) {
    pending = true;
    if (useMacroTask) {
      macroTimerFunc();
    } else {
      microTimerFunc();
    }
  }
  // $flow-disable-line
  //优化没有cb的时候
  if (!cb && typeof Promise !== "undefined") {
    return new Promise(resolve => {
      _resolve = resolve;
    });
  }
}
