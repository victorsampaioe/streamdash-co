import {describe, expect, it} from "vitest";
import {parseSeriesEpisodes} from "./series-episodes";

describe("series metadata — seasons and episodes", () => {
  it("parses Xtream map keyed by season and sorts the real episodes", () => {
    const out=parseSeriesEpisodes({
      seasons:[{season_number:2},{season_number:1}],
      episodes:{
        "2":[{episode_num:"2",title:"Segundo episódio"},{episode_num:1,title:"Primeiro"}],
        "1":[{episode_num:1,title:"Piloto",id:"DO_NOT_RETURN",direct_source:"secret"}],
      },
    });
    expect(out).toEqual({
      provided:true,limited:false,episodeCount:3,
      seasons:[
        {number:1,episodes:[{number:1,name:"Piloto"}]},
        {number:2,episodes:[{number:1,name:"Primeiro"},{number:2,name:"Segundo episódio"}]},
      ],
    });
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("supports providers returning an array rather than season-indexed map", () => {
    const out=parseSeriesEpisodes({episodes:[
      {season:"3",episode_num:"1",title:"Estreia"},
      {season:3,episode_num:2,name:"Final"}
    ]});
    expect(out.seasons).toEqual([{number:3,episodes:[
      {number:1,name:"Estreia"},{number:2,name:"Final"},
    ]}]);
  });

  it("shows declared seasons without inventing unavailable episodes", () => {
    const out=parseSeriesEpisodes({seasons:[{season_number:1},{season_number:4}]});
    expect(out.provided).toBe(true);
    expect(out.episodeCount).toBe(0);
    expect(out.seasons.map(s=>s.number)).toEqual([1,4]);
    expect(out.seasons.every(s=>s.episodes.length===0)).toBe(true);
    expect(parseSeriesEpisodes({error:"unsupported"}).provided).toBe(false);
  });

  it("limits huge provider responses and skips invalid season numbers", () => {
    const huge=Array.from({length:1205},(_,i)=>({episode_num:i+1,title:"Ep "+(i+1)}));
    const out=parseSeriesEpisodes({episodes:{"1":huge, "9999999":[{episode_num:1}]}});
    expect(out.episodeCount).toBe(1200);
    expect(out.limited).toBe(true);
    expect(out.seasons).toHaveLength(1);
  });
});
