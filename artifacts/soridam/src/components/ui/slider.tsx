import * as React from 'react';
import { cn } from '@/lib/utils';

export type SliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
>;

/** 손가락으로도 잡히도록 트랙과 손잡이를 키운 범위 입력 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="range"
        className={cn(
          'h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary',
          '[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md',
          '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Slider.displayName = 'Slider';

export { Slider };
