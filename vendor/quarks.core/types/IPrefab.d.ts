export interface IAnimationData {
    startTime: number;
    duration: number;
    target: any;
}
export interface IPrefab {
    name: string;
    animationData: IAnimationData[];
}
