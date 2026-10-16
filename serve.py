"""
CloudTech 整合主页 serve · 端口 5089(v2 整合版)
- /                → cloudtech 系统主页(整合中台)
- /quote/          → 装报价 SaaS(装修行业细分)
- /content-factory/ → OPC 内容工厂(装修维修获客)
- /lingce/         → lingce-starter demo(数字营销工具)
- 其他 /quote/xxx   → 装报价 SaaS SPA fallback
"""
import os
import sys
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler


# 4 个应用根目录
CLOUDTECH_DIST = Path(r'D:\MiniMax\cloudtech-redesign\web\dist')
QUOTE_DIR = Path(r'D:\yunshu-zhuangqi-live\macxiaxia-boop-yunshu-zhuangqi-99b6f73')
CONTENT_DIR = Path(r'D:\个人文件\AI\Operator\业务\装修建材装企\内容工厂')
LINGCE_DIST = Path(r'D:\Software\lingce-starter\apps\desktop')

# 路径路由
APP_ROUTES = [
    ('/content-factory', CONTENT_DIR),
    ('/quote', QUOTE_DIR),
    ('/lingce', LINGCE_DIST),
    ('/', CLOUDTECH_DIST),
]


def find_app_root(path: str) -> Path | None:
    """根据 URL 路径找对应应用的根目录

    优先级:
    1. /quote/...  → 装报价 SaaS
    2. /content-factory/... → OPC 内容工厂
    3. /lingce/...  → 灵策智算
    4. 其他所有 → cloudtech 整合中台(默认 fallback)
    """
    # 先前缀匹配(子应用)
    for prefix, root in APP_ROUTES:
        if prefix != '/' and path.startswith(prefix):
            if (root / 'index.html').exists():
                return root
    # fallback: cloudtech 整合中台(其他所有路径)
    for prefix, root in APP_ROUTES:
        if prefix == '/':
            if (root / 'index.html').exists():
                return root
    return None


class CloudTechHandler(SimpleHTTPRequestHandler):
    """CloudTech 整合 serve

    路径路由:
      /                → cloudtech 主页
      /quote/          → 装报价 SaaS(行业细分)
      /content-factory/ → OPC 内容工厂
      /lingce/         → lingce-starter demo
    """
    def log_message(self, format, *args):
        # 简化日志
        print(f'[{self.log_date_time_string()}] {self.command} {self.path}')

    def route_and_serve(self):
        """共用路由逻辑(GET / HEAD 共用)"""
        # 路径规范化
        path = self.path.split('?')[0].split('#')[0]
        # /status 自检端点
        if path == '/status':
            self._serve_status()
            return
        # 反向代理: /api/* → cloudtech API 8765
        if path.startswith('/api') or path in ('/docs', '/openapi.json', '/redoc'):
            self._serve_proxy(f'http://127.0.0.1:8765{path}')
            return
        # 找应用根目录
        app_root = find_app_root(path)
        if app_root is None:
            self.send_error(404, f'No app for path: {path}')
            return
        # 应用内路径
        if path in ('/', '/content-factory', '/quote', '/lingce',
                    '/content-factory/', '/quote/', '/lingce/'):
            rel = 'index.html'
        else:
            # 去掉应用前缀
            for prefix, _ in APP_ROUTES:
                if prefix != '/' and path.startswith(prefix + '/'):
                    rel = path[len(prefix) + 1:]
                    break
            else:
                rel = path.lstrip('/')
        target = app_root / rel
        if not target.exists() or target.is_dir():
            target = app_root / 'index.html'  # SPA fallback
        if not target.exists():
            self.send_error(404, f'File not found: {target}')
            return
        # 安全检查(防止路径穿越)
        try:
            target = target.resolve()
            app_root = app_root.resolve()
            if not str(target).startswith(str(app_root)):
                self.send_error(403, 'Path traversal blocked')
                return
        except Exception:
            self.send_error(400, 'Invalid path')
            return
        # serve 文件(直接读,避免 os.chdir 多线程问题)
        try:
            content_bytes = target.read_bytes()
            # 简单 content-type
            if target.suffix == '.html':
                ctype = 'text/html; charset=utf-8'
            elif target.suffix == '.js' or target.suffix == '.mjs':
                ctype = 'application/javascript'
            elif target.suffix == '.css':
                ctype = 'text/css'
            elif target.suffix == '.json':
                ctype = 'application/json'
            elif target.suffix == '.svg':
                ctype = 'image/svg+xml'
            elif target.suffix in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
                ctype = 'image/' + target.suffix.lstrip('.')
            else:
                ctype = 'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-type', ctype)
            self.send_header('Content-Length', str(len(content_bytes)))
            self.end_headers()
            self.wfile.write(content_bytes)
        except Exception as e:
            self.send_error(500, f'read error: {e}')
        return

    def _serve_status(self):
        """/status 自检端点 — JSON 服务状态"""
        import json
        try:
            port = self.server.server_address[1]
        except Exception:
            port = None
        # 检查 8765 API 是否活
        import urllib.request
        api_alive = False
        try:
            urllib.request.urlopen('http://127.0.0.1:8765/api/stats', timeout=2)
            api_alive = True
        except Exception:
            pass
        status = {
            'service': 'CloudTech 整合 serve',
            'version': 'v3 (R31201 + API proxy)',
            'port': port,
            'listening': '0.0.0.0:' + str(port) if port else 'unknown',
            'api_proxy': {
                'target': 'http://127.0.0.1:8765',
                'alive': api_alive,
                'paths': '/api/* /docs /openapi.json /redoc',
            },
            'apps': [
                {'path': '/',                  'app': 'cloudtech 整合',     'root': str(CLOUDTECH_DIST), 'index_exists': (CLOUDTECH_DIST / 'index.html').exists()},
                {'path': '/quote/',             'app': '装报价 SaaS',         'root': str(QUOTE_DIR),      'index_exists': (QUOTE_DIR / 'index.html').exists()},
                {'path': '/content-factory/',   'app': 'OPC 内容工厂',        'root': str(CONTENT_DIR),    'index_exists': (CONTENT_DIR / 'index.html').exists()},
                {'path': '/lingce/',            'app': '灵策智算桌面',         'root': str(LINGCE_DIST),    'index_exists': (LINGCE_DIST / 'index.html').exists()},
            ],
            'ku': {
                'KU-1': '真实账号平台权属(等运营)',
                'KU-2': 'L2/L3/L5 SOP 不在包(D 盘原工程)',
                'KU-3': '真实工地素材(等业务)',
                'KU-4': '真人配音(等业务)',
                'KU-5': '平台发布回执(等 KU-1)',
                'KU-6': '真实咨询成交(等 KU-1)',
                'KU-7': '法务/支付(OPC 可推迟)',
            },
            'tests': {
                'total': 218,
                'modules': {
                    '02_账号稳定': 67,
                    '07_执行与验证': 99,
                    'cross_module': 6,
                    'V5_工具链': 46,
                },
            },
            'namespace': 'yunshu//cloudtech//装修维修获客//内容工厂',
        }
        body = json.dumps(status, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return

    def _serve_proxy(self, target_url):
        """反向代理:转发请求到 target_url(GET / HEAD)"""
        import urllib.request
        try:
            req = urllib.request.Request(target_url, method=self.command)
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read()
                self.send_response(resp.status)
                # 转发 content-type
                ctype = resp.headers.get('Content-Type', 'application/octet-stream')
                self.send_header('Content-type', ctype)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self.send_error(502, f'proxy error: {e}')
        return
        # 应用内路径
        if path in ('/', '/content-factory', '/quote', '/lingce',
                    '/content-factory/', '/quote/', '/lingce/'):
            rel = 'index.html'
        else:
            # 去掉应用前缀
            for prefix, _ in APP_ROUTES:
                if prefix != '/' and path.startswith(prefix + '/'):
                    rel = path[len(prefix) + 1:]
                    break
            else:
                rel = path.lstrip('/')
        target = app_root / rel
        if not target.exists() or target.is_dir():
            target = app_root / 'index.html'  # SPA fallback
        if not target.exists():
            self.send_error(404, f'File not found: {target}')
            return
        # 安全检查(防止路径穿越)
        try:
            target = target.resolve()
            app_root = app_root.resolve()
            if not str(target).startswith(str(app_root)):
                self.send_error(403, 'Path traversal blocked')
                return
        except Exception:
            self.send_error(400, 'Invalid path')
            return
        # serve 文件(直接读,避免 os.chdir 多线程问题)
        try:
            content_bytes = target.read_bytes()
            # 简单 content-type
            if target.suffix == '.html':
                ctype = 'text/html; charset=utf-8'
            elif target.suffix == '.js' or target.suffix == '.mjs':
                ctype = 'application/javascript'
            elif target.suffix == '.css':
                ctype = 'text/css'
            elif target.suffix == '.json':
                ctype = 'application/json'
            elif target.suffix == '.svg':
                ctype = 'image/svg+xml'
            elif target.suffix in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
                ctype = 'image/' + target.suffix.lstrip('.')
            else:
                ctype = 'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-type', ctype)
            self.send_header('Content-Length', str(len(content_bytes)))
            self.end_headers()
            self.wfile.write(content_bytes)
        except Exception as e:
            self.send_error(500, f'read error: {e}')
        return

    def do_GET(self):
        return self.route_and_serve()

    def do_HEAD(self):
        return self.route_and_serve()
        # 路径规范化
        path = self.path.split('?')[0].split('#')[0]
        # 找应用根目录
        app_root = find_app_root(path)
        if app_root is None:
            self.send_error(404, f'No app for path: {path}')
            return
        # 应用内路径
        if path == '/' or path == '/content-factory' or path == '/quote' or path == '/lingce':
            rel = '/index.html'
        elif path in ('/content-factory/', '/quote/', '/lingce/'):
            rel = '/index.html'
        else:
            # 去掉应用前缀
            for prefix, _ in APP_ROUTES:
                if prefix != '/' and path.startswith(prefix):
                    rel = path[len(prefix):]
                    if not rel.startswith('/'):
                        rel = '/' + rel
                    break
            else:
                rel = path
        # 应用内 fallback
        target = app_root / rel.lstrip('/')
        if not target.exists() or target.is_dir():
            target = app_root / 'index.html'  # SPA fallback
        # 安全检查(防止路径穿越)
        try:
            target = target.resolve()
            app_root = app_root.resolve()
            if not str(target).startswith(str(app_root)):
                self.send_error(403, 'Path traversal blocked')
                return
        except Exception:
            self.send_error(400, 'Invalid path')
            return
        # serve 文件
        self.path = '/' + str(target.relative_to(app_root)).replace('\\', '/')
        os.chdir(str(app_root))
        return super().do_GET()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5089
    # IPv4 + IPv6 双栈
    server_v4 = HTTPServer(('0.0.0.0', port), CloudTechHandler)
    # IPv6
    try:
        server_v6 = HTTPServer(('::', port), CloudTechHandler)
        servers = [server_v4, server_v6]
        has_v6 = True
    except OSError:
        # IPv6 不可用(常见于 Windows 仅 IPv4)
        servers = [server_v4]
        has_v6 = False
    print('=' * 60)
    print(f'  CloudTech 整合 serve @ http://localhost:{port}')
    if has_v6:
        print(f'  IPv4 + IPv6 双栈')
    else:
        print(f'  IPv4 only')
    print('=' * 60)
    print(f'  /                  → cloudtech 整合主页')
    print(f'                      {CLOUDTECH_DIST}')
    print(f'  /quote/            → 装报价 SaaS(装修行业细分)')
    print(f'                      {QUOTE_DIR}')
    print(f'  /content-factory/  → OPC 内容工厂(装修维修获客)')
    print(f'                      {CONTENT_DIR}')
    print(f'  /lingce/           → lingce-starter demo')
    print(f'                      {LINGCE_DIST}')
    print('=' * 60)
    print(f'  访问 URL:')
    print(f'    http://localhost:{port}/')
    print(f'    http://127.0.0.1:{port}/')
    print(f'    http://[::1]:{port}/  (IPv6 only)')
    print('=' * 60)
    try:
        import threading
        if len(servers) > 1:
            t = threading.Thread(target=server_v6.serve_forever, daemon=True)
            t.start()
        server_v4.serve_forever()
    except KeyboardInterrupt:
        print('\n[STOP]')
        for s in servers:
            s.shutdown()