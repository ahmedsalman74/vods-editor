# -*- coding: utf-8 -*-
"""صور Vox: نقش نقطي بالأبيض والأسود + ستيكر مقصوص بحدّ أبيض
  python3 halftone.py ht <src> <out.png> [cell=6] [x0 y0 x1 y1]
  python3 halftone.py sticker <src> <out.png>            ← للأجسام الداكنة على خلفية فاتحة (ظلّ طيارة)
⛔ لصور Pexels/Pixabay فقط — **صوره هو لا تُنزع ألوانها ولا تُقصّ أبداً**.
   النقش يمحي ألوان الشعارات (طيارة الإقلاع كانت بشعار شركة — اختفى)، لكن الشعار المقروء بالشكل يُستبعد."""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFilter
def halftone(src,out,cell=6,crop=None,ink=(26,24,22),paper=(236,230,219),maxw=1100):
    im=Image.open(src).convert('L')
    if crop: im=im.crop(crop)
    if im.width>maxw: im=im.resize((maxw,int(im.height*maxw/im.width)))
    g=np.asarray(ImageOps.autocontrast(im,cutoff=2)).astype(float)/255; H,W=g.shape
    S=Image.new('RGB',(W,H),paper); d=ImageDraw.Draw(S)
    for y in range(0,H,cell):
        for x in range(0,W,cell):
            r=(1-g[y:y+cell,x:x+cell].mean())**0.9*cell*0.72
            if r>0.35: cx,cy=x+cell/2+((y//cell)%2)*cell/2,y+cell/2; d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=ink)
    S.save(out); print(out,S.size)
def sticker(src,out,thr=95):
    im=Image.open(src).convert('RGB'); L=np.asarray(im.convert('L')).astype(float)
    ys,xs=np.where(L<thr-25); cy,cx=int(np.median(ys)),int(np.median(xs)); W,H=im.size
    c=im.crop((max(0,cx-420),max(0,cy-300),min(W,cx+420),min(H,cy+300)))
    a=np.clip((thr-np.asarray(c.convert('L')).astype(float))/40,0,1)
    A=Image.fromarray((a*255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))
    edge=A.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(1.2))
    s=Image.new('RGBA',c.size,(0,0,0,0)); s.paste(Image.new('RGBA',c.size,(240,236,228,255)),(0,0),edge)
    s.paste(Image.new('RGBA',c.size,(30,28,26,255)),(0,0),A); s=s.crop(s.getbbox()); s.save(out); print(out,s.size)
if __name__=='__main__':
    m=sys.argv[1]
    if m=='ht': halftone(sys.argv[2],sys.argv[3],int(sys.argv[4]) if len(sys.argv)>4 else 6,
                         tuple(map(int,sys.argv[5:9])) if len(sys.argv)>8 else None)
    elif m=='sticker': sticker(sys.argv[2],sys.argv[3])
