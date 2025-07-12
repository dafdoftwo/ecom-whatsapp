import * as React from "react"

function Card({ className = '', ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={`card ${className}`}
      {...props}
    />
  )
}

function CardHeader({ className = '', ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={`card-header ${className}`}
      {...props}
    />
  )
}

function CardTitle({ className = '', ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={className}
      {...props}
    />
  )
}

function CardDescription({ className = '', ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={className}
      style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}
      {...props}
    />
  )
}

function CardContent({ className = '', ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={`card-body ${className}`}
      {...props}
    />
  )
}

function CardFooter({ className = '', ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={`card-footer ${className}`}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
