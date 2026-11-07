import bpy, numpy as np, pathlib, sys
out=pathlib.Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
N=256;rng=np.random.default_rng(7301)
# Low-contrast stone and binder, periodically filtered so all edges tile.
fine=rng.random((N,N));mottle=rng.random((N,N))
for _ in range(5):mottle=(mottle+np.roll(mottle,1,0)+np.roll(mottle,-1,0)+np.roll(mottle,1,1)+np.roll(mottle,-1,1))/5
value=np.clip(.68+(fine-.5)*.19+(mottle-.5)*.32,.42,.9)
value=np.where(fine>.992,np.minimum(1,value+.14),value)
rgba=np.ones((N,N,4),np.float32);rgba[:,:,0]=value*.96;rgba[:,:,1]=value*.99;rgba[:,:,2]=value
im=bpy.data.images.new('asphalt_tile',width=N,height=N,alpha=True);im.pixels.foreach_set(rgba.reshape(-1));im.filepath_raw=str(out/'asphalt.png');im.file_format='PNG';im.save()
print('TEXTURE_BUILT',out/'asphalt.png')
