---
title: "Effective Java - 아이템 23: 태그 달린 클래스보다는 클래스 계층구조를 활용하라"
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
// 태그 달린 클래스 - 클래스 계층구조보다 훨씬 나쁘다
class Figure {
    enum Shape { RECTANGLE, CIRCLE };
    
    // 태그 필드 - 현재 모양을 나타낸다.
    final Shape shape;
    
    // 다음 필드들은 모양이 사각형일 때만 쓰인다.
    double length;
    double width;
    
    // 다음 필드는 모양이 원일 때만 쓰인다.
    double radius;

    // 원용 생성자
    Figure(double radius) {
        shape = Shape.CIRCLE;
        this.radius = radius;
    }

    // 사각형용 생성자
    Figure(double length, double width) {
        this.shape = Shape.RECTANGLE;
        this.length = length;
        this.width = width;
    }
    
    double area() {
        switch (shape) {
            case RECTANGLE -> length * width;
            case CIRCLE -> Math.PI * (radius * radius);
            default -> throw new AssertionError(shape);
        }
    }
}
```

### 태그 달린 클래스 단점
태그 달린 클래스는 단점이 한가득이다. 우선 열거 타입 선언, 태그 필드, switch 문 등 쓸데없는 코드가 많다.
여러 구현이 한 클래스에 혼합돼 있어서 가독성도 나쁘다. 다른 의미를 위한 코드도 언제나 함께 하니 메모리도 많이 사용한다.
태그 달린 클래스는 장황하고, 오류를 내기 쉽고, 비효율적이다.

**계층구조를 활용하는 서브타이핑(subtyping)을 활용하면 이 단점을 극복할 수 있다.**

### 태그 달린 클래스를 클래스 계층구조로 바꾸는 방법
1. 계층 구조의 루트가 될 추상 클래스를 정의한다.
2. 태그 값에 따라 동작이 달라지는 메서드들을 루트 클래스의 추상 메서드로 선언한다.
3. 태그 값에 상관없이 동작하는 일정한 메서드들을 루트 클래스에 일반 메서드로 추가한다.
4. 모든 하위 클래스에서 공통으로 사용하는 데이터 필드들도 전부 루트 클래스로 올린다.
5. 루트 클래스를 확장한 구체 클래스를 의미별로 하나씩 정의한다.

```java
// 태그 달린 클래스를 계층구조로 변환
abstract class Figure {
    abstract double area();
}

class Circle extends Figure {
    final double radius;

    Circle(double radius) {
        this.radius = radius;
    }

    @Override
    double area() {
        return Math.PI * (radius * radius);
    }
}

class Rectangle extends Figure {
    final double length;
    final double width;

    Rectangle(double length, double width) {
        this.length = length;
        this.width = width;
    }

    @Override
    double area() {
        return length * width;
    }
}
```

각각의 의미를 독립된 클래스에 담아 관련 없던 데이터 필드를 모두 제거했다. **살아 남은 필드들은 모두 final이다.** 
루트 클래스의 코드를 건드리지 않고도 다른 프로그래머들이 독립적으로 계층구조를 확장하고 함께 사용할 수 있다.
타입이 의미별로 따로 존재하니 변수의 의미를 명시하거나 제한할 수 있고, 또 특정 의미만 매개변수로 받을 수 있다.
또한 타입 사이의 자연스러운 계층 관계를 반영할 수 있어서 유연성은 물론 컴파일타임 타입 검사 능력을 높여준다.

### 핵심 정리
태그 달린 클래스를 써야 하는 상황은 거의 없다.
새로운 클래스를 작성하는 데 태그 필드가 등장한다면 태그를 없애고 계층구조로 대체하는 방법을 생각해보자.
