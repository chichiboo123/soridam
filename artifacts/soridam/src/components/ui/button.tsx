import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * 소리담 VER2 버튼.
 *
 * 화면마다 흩어져 있던 `shadow-[0_6px_0_0_rgba(0,0,0,0.15)] active:translate-y-[6px]`
 * 같은 임의값을 `sd-pop` / `sd-press` 유틸리티로 모았습니다. 그림자 깊이와
 * 눌림 이동량이 항상 같은 값(--pop-depth)에서 나오므로 어긋나지 않습니다.
 */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-bold transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/92 sd-pop sd-press',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/92 sd-pop sd-press',
        accent:
          'bg-accent text-accent-foreground hover:bg-accent/90 sd-pop sd-press',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/92 sd-pop sd-press',
        /** 카드 위에 놓이는 중립 액션 — 테두리가 있는 흰 버튼 */
        soft: 'bg-card text-foreground border-2 border-border hover:bg-muted sd-pop sd-pop-soft sd-press',
        /** 사용 빈도가 낮은 보조 액션 */
        muted:
          'bg-muted text-foreground hover:bg-muted/80 sd-pop sd-pop-soft sd-press',
        outline:
          'border-2 border-border bg-card text-foreground hover:bg-muted hover:text-foreground',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        /** 44px — WCAG 2.5.5 최소 터치 타겟 */
        sm: 'h-11 rounded-xl px-4 text-sm',
        default: 'h-12 rounded-xl px-5 text-[0.9375rem]',
        lg: 'h-14 rounded-2xl px-7 text-base',
        xl: 'h-16 rounded-2xl px-8 text-lg',
        icon: 'size-12 rounded-xl p-0',
        'icon-sm': 'size-11 rounded-xl p-0',
        'icon-lg': 'size-14 rounded-2xl p-0',
        none: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        // 폼 안에서 실수로 submit 되지 않도록 기본 타입을 명시합니다.
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
