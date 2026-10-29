# Phase 0 probe 1 — READ ONLY. ColourAdjust layers and their field sequences.
#
# Answers: Q1 (sequence names, how Colour fields split), Q5 inputs (playhead, tStart/tEnd,
# contains()), Q7 candidate (SuperLayer.render), layer uid for getByUID().
# Touches no setters and never calls KeySequence.key() (KeyAsKeyContainer crasher).
# Every name used here was checked in packages/shared/d3.pyi of d3-plugin-toolkit:
#   guisystem.track/.player, TrackPlayer.tCurrent/tRender/playing, Track.description,
#   SuperLayer.getLeafLayers/tStart/tEnd/contains/render/name, Layer.moduleType/nSequences/
#   sequence(i), FieldSequence.name/userName/typeName/disableSequencing/noSequence/sequence,
#   KeySequence.nKeys/t(i), Resource.uid
#
# Run: npm run cli -- exec --file C:/dev/disguise-color-grader/probes/probe_colouradjust_sequences.py

import json
import d3

out = {'ok': True}
try:
    track = guisystem.track
    player = guisystem.player
    out['track'] = str(track.description)
    out['tCurrent'] = float(player.tCurrent)
    try:
        out['tRender'] = float(player.tRender)
    except:
        out['tRender'] = None
    try:
        out['playing'] = bool(player.playing)
    except:
        out['playing'] = None

    leaf = track.getLeafLayers(d3.ColourAdjustModule)  # Track.getLeafLayers(type)
    out['leafCount'] = len(leaf)
    layers = []
    for i in range(len(leaf)):
        L = leaf[i]
        try:
            mt = str(L.moduleType())
        except:
            mt = '?'
        if 'ColourAdjust' not in mt:
            continue
        info = {'index': i, 'moduleType': mt}
        try:
            info['name'] = str(L.name)
            info['uid'] = '0x%016x' % int(L.uid)
            info['tStart'] = float(L.tStart)
            info['tEnd'] = float(L.tEnd)
            info['containsPlayhead'] = bool(L.contains(out['tCurrent']))
        except:
            info['error'] = 'basic attrs failed'
        try:
            info['render'] = bool(L.render)
        except:
            info['render'] = 'unreadable'
        seqs = []
        try:
            n = L.nSequences()
            for j in range(n):
                fs = L.sequence(j)
                s = {}
                try:
                    s['name'] = str(fs.name)
                    s['userName'] = str(fs.userName)
                    s['typeName'] = str(fs.typeName)
                    s['disableSequencing'] = bool(fs.disableSequencing)
                    s['noSequence'] = bool(fs.noSequence)
                    ks = fs.sequence
                    nk = ks.nKeys()
                    s['nKeys'] = nk
                    s['keyTimes'] = [float(ks.t(k)) for k in range(min(nk, 8))]
                except:
                    s['error'] = 'sequence attrs failed'
                seqs.append(s)
        except:
            info['seqError'] = 'nSequences/sequence failed'
        info['sequences'] = seqs
        layers.append(info)
    out['colourAdjustLayers'] = layers
except:
    out['ok'] = False
    import traceback
    out['trace'] = traceback.format_exc()

return json.dumps(out)
