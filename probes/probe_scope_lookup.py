# Scope probe S1/S2/S4 — READ ONLY. Which feed rectangles show each ColourAdjust layer, and can
# remote Python see the GUI objects needed to open Designer's Vectorscope?
#
# S1: layer -> mapping at the playhead -> screens -> matching feed rects (direct and projector).
# S2: is guisystem.feed / d3gui / ResizableWidget / gui.vectorscope reachable? Creates nothing.
# S4: what identity a FeedRect exposes (uid, path, index).
#
# Patterns followed (d3-plugin-toolkit KB):
#   multitransport-live-surface-stack.md — mapping via findSequence("mapping").getSequencedValue(t).value,
#     FeedProjection via feed_scene.feedRects, referenceDisplay / resolveDisplay()
#   safe-iteration.md (index loops), bare-except-required.md, no dir() on d3 objects
#   machines: resourceManager.allResources(d3.Machine) -> m.feed.feedRects (reference-tools)
# Names checked in d3.pyi: Track.getLeafLayers, Layer.findSequence, FieldSequence.getSequencedValue,
#   SequencedValue.value, Projection.screens, FeedProjection.feed_scene, FeedScene.feedRects/headConfigs/
#   currentMachines, Machine.feed, FeedRect.active/head/referenceDisplay/resolveDisplay/displayTarget,
#   TrackPlayer.tRender, Resource.uid/path/description
#
# Run (toolkit root): npm run cli -- exec --file <repo>/probes/probe_scope_lookup.py

import json
import d3


def txt(v):
    try:
        return '' if v is None else str(v)
    except:
        return ''


def hexuid(r):
    try:
        return '0x%016x' % int(r.uid)
    except:
        return ''


def tname(o):
    try:
        return str(type(o).__name__)
    except:
        return '?'


def desc(r):
    try:
        return txt(r.description)
    except:
        try:
            return txt(r.name)
        except:
            return ''


def disp(d):
    if d is None:
        return None
    info = {'type': tname(d), 'uid': hexuid(d), 'path': '', 'name': desc(d)}
    try:
        info['path'] = txt(d.path)
    except:
        pass
    # Projector: list the surfaces it covers
    if info['type'] == 'Projector':
        try:
            scr = d.screens
            info['screens'] = [hexuid(scr[k]) for k in range(len(scr))]
        except:
            info['screens'] = 'unreadable'
    return info


out = {'ok': True}
try:
    player = guisystem.player
    t = float(player.tRender)
    out['tRender'] = t
    try:
        out['playing'] = bool(player.playing)
    except:
        out['playing'] = None

    # ---- S1a: machines and their feed rects ----
    machines = []
    try:
        cur = d3.FeedScene.currentMachines()
        out['currentMachines'] = [desc(cur[i]) for i in range(len(cur))]
    except:
        out['currentMachines'] = 'unavailable'
    allm = resourceManager.allResources(d3.Machine)
    for i in range(len(allm)):
        m = allm[i]
        mi = {'name': desc(m), 'uid': hexuid(m), 'rects': []}
        try:
            mi['path'] = txt(m.path)
        except:
            pass
        try:
            feed = m.feed
        except:
            feed = None
        if not feed:
            mi['feed'] = None
            machines.append(mi)
            continue
        try:
            nheads = len(feed.headConfigs)
        except:
            nheads = -1
        mi['nHeads'] = nheads
        rects = feed.feedRects
        for j in range(len(rects)):
            r = rects[j]
            ri = {'index': j, 'type': tname(r), 'uid': hexuid(r), 'name': desc(r)}
            try:
                ri['path'] = txt(r.path)
            except:
                pass
            try:
                ri['active'] = bool(r.active)
            except:
                ri['active'] = None
            try:
                ri['head'] = int(r.head)
            except:
                ri['head'] = None
            try:
                ri['displayTarget'] = int(r.displayTarget)
            except:
                pass
            try:
                ri['referenceDisplay'] = disp(r.referenceDisplay)
            except:
                ri['referenceDisplay'] = 'unreadable'
            try:
                ri['resolveDisplay'] = disp(r.resolveDisplay())
            except:
                ri['resolveDisplay'] = 'unreadable'
            mi['rects'].append(ri)
        machines.append(mi)
    out['machines'] = machines

    # ---- S1b: ColourAdjust layers -> mapping at playhead -> screens -> matches ----
    layers = []
    leaf = guisystem.track.getLeafLayers(d3.ColourAdjustModule)
    for i in range(len(leaf)):
        L = leaf[i]
        li = {'name': txt(L.name), 'uid': hexuid(L)}
        try:
            li['live'] = bool(L.contains(t))
        except:
            li['live'] = None
        screens = []
        try:
            fs = L.findSequence('mapping')
            proj = fs.getSequencedValue(t).value
            li['mapping'] = {'type': tname(proj), 'name': desc(proj), 'uid': hexuid(proj)}
            try:
                s = proj.screens
                screens = [disp(s[k]) for k in range(len(s))]
            except:
                li['mapping']['screens'] = 'unreadable'
            if tname(proj) == 'FeedProjection':
                try:
                    fr = proj.feed_scene.feedRects
                    li['mapping']['feedSceneDisplays'] = [disp(fr[k].referenceDisplay) for k in range(len(fr))]
                except:
                    li['mapping']['feedSceneDisplays'] = 'unreadable'
        except:
            li['mapping'] = 'unreadable'
        li['screens'] = screens
        want = set([s['uid'] for s in screens if s and s.get('uid')])
        matches = []
        for mi in machines:
            for ri in mi.get('rects', []):
                rd = ri.get('referenceDisplay')
                if not isinstance(rd, dict):
                    continue
                hit = rd.get('uid') in want
                if not hit and isinstance(rd.get('screens'), list):
                    hit = len(want.intersection(set(rd['screens']))) > 0
                if hit:
                    matches.append({'machine': mi['name'], 'rect': ri['index'], 'head': ri.get('head'),
                                    'active': ri.get('active'), 'display': rd.get('name')})
        li['matches'] = matches
        layers.append(li)
    out['layers'] = layers

    # ---- S2: GUI reachability (no object is created) ----
    g = {}
    try:
        f = getattr(guisystem, 'feed', None)
        g['guisystem.feed'] = tname(f) if f is not None else None
        g['hasScopeFeedRectFrame'] = f is not None and callable(getattr(f, 'scopeFeedRectFrame', None))
    except:
        g['guisystem.feed'] = 'error'
    try:
        g['d3gui'] = tname(d3gui)
        try:
            g['d3gui.root'] = tname(d3gui.root)
        except:
            g['d3gui.root'] = 'error'
    except:
        g['d3gui'] = 'missing'
    try:
        g['ResizableWidget'] = txt(ResizableWidget)
    except:
        g['ResizableWidget'] = 'missing'
    try:
        import gui.vectorscope as vs
        g['import gui.vectorscope'] = callable(getattr(vs, 'VectorscopeWidget', None))
    except:
        import traceback
        g['import gui.vectorscope'] = traceback.format_exc().strip().splitlines()[-1]
    out['gui'] = g
except:
    out['ok'] = False
    import traceback
    out['trace'] = traceback.format_exc()

return json.dumps(out)
