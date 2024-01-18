---
title: "Effective Java - 아이템 16: public 클래스에서는 public 필드가 아닌 접근자 메서드를 사용하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

```java
// 퇴보한 public 클래스
class Point {
    public double x;
    public double y;
}
// 데이터 필드에 직접 접근할 수 있으니 캡슐화의 이점을 제공하지 못한다.
// API를 수정하지 않고는 내부 표현을 바꿀 수 없고, 불변식을 보장할 수 없으며,
// 외부에서 필드에 접근할 때 부수 작업을 수행할 수도 없다.

class Point {
    private double x;
    private double y;

    public Point(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double setX() {
        this.x = x;
    }

    public double setY() {
        this.y = y;
    }
```

public 클래스는 패키지 바깥에서 접근자를 제공함으로써 클래스 내부 표현 방식을 언제든 바꿀 수 있는 유연성을 얻을 수 있다. 만약 public 클래스의 필드를 공개하면 이를 사용하는 클라이언트가 생겨날 것이므로
내부 표현 방식을 마음대로 바꿀 수 없게 된다.

하지만 package-private 클래스, private 중첩 클래스는 데이터 필드를 노출한다고 해도 문제가 없다. 이 방식은 접근자 방식보다 훨씬 깔끔하다. 패키지 바깥 코드는 전혀 손대지 않고도 데이터 표현
방식을 바꿀 수 있다. private 중첩 클래스의 경우라면 수정 범위가 더 좁아져 이 클래스를 포함하는 외부 클래스까지로 제한된다.

### 핵심 정리

public 클래스는 절대 가변 필드를 직접 노출해서는 안 된다. 하지만 package-private 클래스나 private 중첩 클래스에서는 종종(불변이든 가변이든) 필드를 노출하는 편이 나을 때도 있다.
