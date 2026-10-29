import sys, re
from html.parser import HTMLParser
class H(HTMLParser):
    def __init__(s): super().__init__(); s.o=[]; s.skip=0
    def handle_starttag(s,t,a):
        if t in('script','style','noscript'): s.skip+=1
        if t in('br','p','div','tr','li','h1','h2','h3','h4','table'): s.o.append('\n')
        if t in('td','th'): s.o.append(' | ')
        if t=='img':
            a=dict(a); 
            if a.get('alt'): s.o.append('['+a['alt']+']')
    def handle_endtag(s,t):
        if t in('script','style','noscript'): s.skip-=1
    def handle_data(s,d):
        if not s.skip: s.o.append(d)
h=H(); h.feed(open(sys.argv[1],encoding='utf-8',errors='replace').read())
t=re.sub(r'[ \t]+',' ',''.join(h.o)); t=re.sub(r'\n\s*\n+','\n',t)
print(t)
