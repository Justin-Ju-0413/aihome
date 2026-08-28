// React 19 act(): jsdom 测试环境需要显式声明，否则报 "not configured to support act(...)"。
// 该标记仅影响 React 渲染测试；node 环境测试不使用 act，无副作用。
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
