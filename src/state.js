// state.js — shared app state: camera, mode, day/night clock.
import{vnorm}from'./math.js';

export const S={
  mode:'orbit',                      // 'orbit' | 'fp'
  yaw:0.7,pitch:-0.28,dist:3.4,panX:0,panY:0,drag:false,
  theta:20/240*2*Math.PI,omega:0,    // planet rotation angle + rad/s
};
// day/night: sun fixed in world space, planet spins via model rotY(theta)
export const SUNW=vnorm([1,0.35,0]);
