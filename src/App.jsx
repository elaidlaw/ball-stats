import logo from './logo.svg';
import './App.css';
import React from 'react';
import colormap from 'colormap';

export default class App extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      spreadsheetData: null,
      individualStats: [],
      players: [],
      individualStatsSort: { index: 0, reverse: false },
      duoStats: {},
      duoStatsShow: [],
    }
  }

  async loadData() {
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/1os4L-c_6UbAi7lMICwdh3K1vvqYlnKQyO-QCwLIqPfY/values/Form%20Responses?key=AIzaSyD9Ugw9YZOY4z0cG51w5w0tST--S9GpDss';
    var data = await fetch(url)
    .then(res => res.json())
    .then(res => res.values);
    this.setState({ spreadsheetData: data });

    var individualScoringColumnIndices = {};
    var matchupColumnIndices = [];
    for (var i = 0; i < data[0].length; i++) {
      var col = data[0][i];
      if (col.startsWith('Individual Scoring')) {
        individualScoringColumnIndices[col.substring(20, col.length - 1)] = i;
      }
      if (col.startsWith('Matchups')) {
        matchupColumnIndices.push(i);
      }
    }
    
    var games = [];
    var metadata = null;
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[1] != '') {
        metadata = row.slice(1, 5);
      }
      var game = {
        date: metadata[0],
        time: metadata[1],
        temp: parseInt(metadata[2]),
        location: metadata[3],
        gameNumber: parseInt(row[5]),
        team1: row[7].split(', '),
        team2: row[8].split(', '),
        team1Score: parseInt(row[9]),
        team2Score: parseInt(row[10]),
        scoring: {},
        matchups: {}
      };
      game.team1.concat(game.team2).forEach((player) => {
        game.scoring[player] = row[individualScoringColumnIndices[player]] ? parseInt(row[individualScoringColumnIndices[player]]) : 0;
      })
      matchupColumnIndices.forEach((matchupColumnIndex) => {
        if (!row[matchupColumnIndex]) {
          return;
        }
        var players = row[matchupColumnIndex].split(', ');
        game.matchups[players[0]] = players[1];
        game.matchups[players[1]] = players[0];
      })
      games.push(game);
    }
    var players = Object.keys(individualScoringColumnIndices)
    var playerGames = {};
    players.forEach((player) => playerGames[player] = []);

    var initDuoStat = (initialValue) => {
      var mat = {};
      players.forEach((p1) => {
        var row = {};
        players.forEach((p2) => {
          row[p2] = initialValue();
        })
        mat[p1] = row;
      })
      return mat;
    }

    var duoStats = {
      gamesPlayed: {
        data: initDuoStat(() => 0),
        type: 'int'
      },
      matchupFrequency: {
        data: initDuoStat(() => 0),
        type: 'int'
      },
      winRate: {
        data: initDuoStat(() => []),
        type: 'percent'
      },
      matchupWinrate: {
        data: initDuoStat(() => []),
        type: 'percent'
      },
    };

    games.forEach((game) => {
      var addToPlayerGames = (player, team) => {
        playerGames[player].push({
          win: team == 1 ? game.team1Score > game.team2Score : game.team1Score < game.team2Score,
          points: game.scoring[player],
          matchup: game.matchups[player],
          matchupPoints: game.scoring[game.matchups[player]],
          pointDifferential: team == 1 ? game.team1Score - game.team2Score : game.team2Score - game.team1Score
        });
      }
      game.team1.forEach((p1) => {
        addToPlayerGames(p1, 1);
        duoStats.matchupFrequency.data[p1][game.matchups[p1]]++;
        duoStats.matchupWinrate.data[p1][game.matchups[p1]].push(game.team1Score > game.team2Score ? 0 : 1);
        game.team1.forEach((p2) => {
          if (p1 == p2) return;
          duoStats.gamesPlayed.data[p1][p2]++;
          duoStats.winRate.data[p1][p2].push(game.team1Score > game.team2Score ? 1 : 0);
        })
      });
      game.team2.forEach((p1) => {
        addToPlayerGames(p1, 2);
        duoStats.matchupFrequency.data[p1][game.matchups[p1]]++;
        duoStats.matchupWinrate.data[p1][game.matchups[p1]].push(game.team1Score > game.team2Score ? 1 : 0);
        game.team2.forEach((p2) => {
          if (p1 == p2) return;
          duoStats.gamesPlayed.data[p1][p2]++;
          duoStats.winRate.data[p1][p2].push(game.team1Score > game.team2Score ? 0 : 1);
        })
      });
    });
    var average = array => array.length > 0 ? array.reduce((a, b) => a + b) / array.length : -1;
    
    var applyToDuoStat = (statName, func) => {
      players.forEach((p1) => {
        players.forEach((p2) => {
          duoStats[statName].data[p1][p2] = func(duoStats[statName].data[p1][p2]);
        })
      })
    }

    applyToDuoStat('winRate', average);
    applyToDuoStat('matchupWinrate', average);

    var playerWinrates = {};
    var playerGamesPlayed = {};
    var playerPointsPerGame = {};
    var playerPointsAllowedPerGame = {};
    var playerPointsAllowedVsExpected = {};
    var playerPointDifferential = {};
    players.forEach((player) => {
      playerWinrates[player] = average(playerGames[player].map((pg) => pg.win ? 1 : 0));
      playerGamesPlayed[player] = playerGames[player].length;
      playerPointsPerGame[player] = average(playerGames[player].map((pg) => pg.points));
      playerPointsAllowedPerGame[player] = average(playerGames[player].map((pg) => pg.matchupPoints));
      playerPointDifferential[player] = average(playerGames[player].map((pg) => pg.pointDifferential));
    })

    players.forEach((player) => {
      playerPointsAllowedVsExpected[player] = average(playerGames[player].map((pg) => pg.matchupPoints - playerPointsPerGame[pg.matchup]));
    })

    var players = Object.keys(individualScoringColumnIndices).filter((player) => playerGamesPlayed[player] > 0);
    this.setState({ players });

    

    duoStats.gamesPlayed.cmap = {
      min: -0.01,
      max: Math.max(...Object.values(duoStats.gamesPlayed.data).map((row) => Math.max(...Object.values(row)))),
      colors: colormap({
        colormap: 'cool',
        format: 'rgbaString',
        alpha: [.2, .2]
      }),
    }

    duoStats.matchupFrequency.cmap = {
      min: -0.01,
      max: Math.max(...Object.values(duoStats.matchupFrequency.data).map((row) => Math.max(...Object.values(row)))),
      colors: colormap({
        colormap: 'cool',
        format: 'rgbaString',
        alpha: [.2, .2]
      }),
    }

    duoStats.winRate.cmap = {
      min: -0.01,
      max: 1,
      colors: colormap({
        colormap: 'cool',
        format: 'rgbaString',
        alpha: [.2, .2]
      }),
    }

    duoStats.matchupWinrate.cmap = {
      min: -0.01,
      max: 1,
      colors: colormap({
        colormap: 'cool',
        format: 'rgbaString',
        alpha: [.2, .2]
      }),
    }

    this.setState({
      individualStats: [
        {
          name: 'GP',
          description: 'Games played',
          data: playerGamesPlayed,
          type: 'int',
          cmap: {
            min: 0,
            max: Math.max(...Object.values(playerGamesPlayed)),
            colors: colormap({
              colormap: 'cool',
              format: 'rgbaString',
              alpha: [.2, .2]
            }),
          }
        },
        {
          name: 'WR',
          description: 'Winrate',
          data: playerWinrates,
          type: 'percent',
          cmap: {
            min: 0,
            max: 1,
            colors: colormap({
              colormap: 'cool',
              format: 'rgbaString',
              alpha: [.2, .2]
            }),
          }
        },
        {
          name: 'PD',
          description: 'Average team point differential',
          data: playerPointDifferential,
          type: 'decimal',
          cmap: {
            min: Math.min(...Object.values(playerPointDifferential)),
            max: Math.max(...Object.values(playerPointDifferential)),
            colors: colormap({
              colormap: 'cool',
              format: 'rgbaString',
              alpha: [.2, .2]
            }),
          }
        },
        {
          name: 'P',
          description: 'Points per game',
          data: playerPointsPerGame,
          type: 'decimal',
          cmap: {
            min: 0,
            max: Math.max(...Object.values(playerPointsPerGame)),
            colors: colormap({
              colormap: 'cool',
              format: 'rgbaString',
              alpha: [.2, .2]
            }),
          }
        },
        {
          name: 'PA',
          description: 'Points allowed per game',
          data: playerPointsAllowedPerGame,
          type: 'decimal',
          cmap: {
            min: 0,
            max: Math.max(...Object.values(playerPointsAllowedPerGame)),
            reverse: true,
            colors: colormap({
              colormap: 'cool',
              format: 'rgbaString',
              alpha: [.2, .2]
            }),
          }
        },
        {
          name: 'MPVE',
          description: 'Matchup points vs. expected per game',
          data: playerPointsAllowedVsExpected,
          type: 'decimal',
          cmap: {
            min: Math.min(...Object.values(playerPointsAllowedVsExpected)),
            max: Math.max(...Object.values(playerPointsAllowedVsExpected)),
            reverse: true,
            colors: colormap({
              colormap: 'cool',
              format: 'rgbaString',
              alpha: [.2, .2]
            }),
          }
        },
      ]
    });
    this.setState({ duoStats, duoStatsShow: ['gamesPlayed', 'winRate', 'matchupWinrate', 'matchupFrequency'] })
  }

  componentDidMount() {
    this.loadData();
  }

  render() {

    var statString = (num, type) => {
      switch (type) {
        case 'percent':
          return num != -1 ? Number(num * 100).toFixed(0) + '%' : '';
        case 'decimal':
          return num != -1 ? Number(num).toFixed(2) : 'N/A';
        case 'int':
          return num != -1 ? num : 'N/A';
      }
    }

    var getBgColor = (val, cmap) => {
      if (!cmap) return null;
      var index = Math.floor(cmap.colors.length * (val - .0001 - cmap.min) / (cmap.max - cmap.min));
      return cmap.colors[cmap.reverse ? cmap.colors.length - 1 - index : index];
    }

    var iStats = this.state.individualStats;
    var iStatsSort = this.state.individualStatsSort;

    return (
      <div className="App">
          <div id="container">
            <h3>Basketball stats</h3>
            <h6>Individual stats</h6>
            <div id="iStatsContainer">
              <table className="statsTable">
                <thead>
                  <tr>
                    <th><p>Name</p></th>
                    {this.state.individualStats.map((stat, i) => (
                      <th onClick={() => this.setState((prevState) => ({ individualStatsSort: { index: i, reverse: prevState.individualStatsSort.index == i ? !prevState.individualStatsSort.reverse : false}}))}>
                        <p>{stat.name + (iStatsSort.index == i ? (iStatsSort.reverse ? ' ⬆' : ' ⬇') : '')}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {this.state.players.sort((p1, p2) => (iStatsSort.reverse ? -1 : 1) * (iStats[iStatsSort.index].data[p2] - iStats[iStatsSort.index].data[p1])).map((player) => (
                    <tr>
                      <td id="dStatsHeader"><p>{player}</p></td>
                      {this.state.individualStats.map((stat) => (
                        <td style={{backgroundColor: getBgColor(stat.data[player], stat.cmap)}}><p>{statString(stat.data[player], stat.type)}</p></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div id="legend">
                <table>
                  <tbody>
                    {this.state.individualStats.map((stat) => (
                      <tr>
                        <td><p className="legendAcronym">{stat.name}</p></td>
                        <td><p>{stat.description}</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* <h6>Duo stats</h6>
            <div id="dStatsContainer">
              <table className="statsTable" id="dStatsTable">
                <tbody>
                  <tr>
                    <td id="dStatsHeader"></td>
                    {this.state.players.map((player) => (
                      <td id="dStatsHeader"><div><p>{player}</p></div></td>
                    ))}
                  </tr>
                  {this.state.players.map((p1) => (
                    <tr>
                      <td id="dStatsHeader"><p>{p1}</p></td>
                      {this.state.players.map((p2) => (
                        <td>
                          <div className="dStatsCell">
                            {this.state.duoStatsShow.map((statName) => (
                              <div className="dStatsStat" style={p1 != p2 ? {backgroundColor: getBgColor(this.state.duoStats[statName].data[p1][p2], this.state.duoStats[statName].cmap)} : null}>
                                <p>{p1 != p2 ? statString(this.state.duoStats[statName].data[p1][p2], this.state.duoStats[statName].type) : ''}</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div> */}
          </div>
      </div>
    );
  }
}
