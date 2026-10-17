#!/usr/bin/env python3
"""Servidor local mínimo (opcional). El simulador abre directo con doble clic en index.html;
use este servidor sólo si su navegador bloquea archivos locales."""
import http.server
import os
import socketserver
import webbrowser

PUERTO = 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))
with socketserver.TCPServer(("127.0.0.1", PUERTO), http.server.SimpleHTTPRequestHandler) as srv:
    url = f"http://127.0.0.1:{PUERTO}/index.html"
    print(f"Simulador en {url}  (Ctrl+C para cerrar)")
    webbrowser.open(url)
    srv.serve_forever()
